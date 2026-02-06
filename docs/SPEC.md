# iPred: Confidential Prediction Market (cPM) Specification

> Trade prediction markets with the transparency of DeFi and the privacy of CeFi

## Executive Summary

iPred est un protocole de marche predictif confidentiel (Confidential Prediction Market - cPM) base sur des **Confidential Tokens** utilisant le chiffrement NaCl (TweetNaCl). Le protocole exploite iExec TEE (Trusted Execution Environment) pour gerer les balances chiffrees et executer les transferts de maniere confidentielle.

Les utilisateurs deposent des USDC qui sont convertis en **cUSDC** (Confidential USDC). Pour chaque marche predictif, deux tokens confidentiels sont crees : **cYES** et **cNO**. Toutes les balances sont chiffrees on-chain, et seule l'iApp TEE peut dechiffrer, calculer et re-chiffrer les montants lors des transferts.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Confidential Token Model](#confidential-token-model)
4. [Core Components](#core-components)
5. [Privacy Model](#privacy-model)
6. [Market Mechanics](#market-mechanics)
7. [Price Discovery Challenge](#price-discovery-challenge)
8. [Resolution & Settlement](#resolution--settlement)
9. [Security Model](#security-model)
10. [Technical Stack](#technical-stack)
11. [Implementation Roadmap](#implementation-roadmap)
12. [API Specification](#api-specification)

---

## Overview

### Problem Statement

Current prediction markets (Polymarket, Augur) expose:
- **Order flow**: Front-runners can see and exploit pending bets
- **Position sizes**: Competitors can see your exposure and trade against you
- **Market sentiment**: Visible order books reveal information before resolution
- **Whale activity**: Large bets move markets before execution

### Solution

iPred utilise des **Confidential ERC20** avec des montants chiffres via NaCl :
- Les balances sont chiffrees on-chain (personne ne voit les montants)
- Chaque transfert declenche une iApp TEE qui dechiffre, calcule et re-chiffre
- La cle privee de chiffrement (sealed key) reste dans le TEE, jamais exposee
- Le settlement se fait de maniere confidentielle

### Key Features

| Feature | Description |
|---------|-------------|
| Confidential Tokens | cUSDC, cYES, cNO avec balances chiffrees via NaCl (XSalsa20-Poly1305) |
| Binary Markets (MVP) | 2 outcomes uniquement : YES / NO |
| TEE-Gated Transfers | Chaque transfert execute une iApp pour update les balances |
| Private Settlement | Winners receive funds without revealing positions |
| MEV Resistant | Encrypted balances prevent front-running |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface                               │
│                    (React Frontend / CLI)                            │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ USDC Deposit / Withdraw
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Bellecour L2 Contracts                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  MarketFactory  │  │ ConfidentialERC20│  │    cYES / cNO      │  │
│  │                 │  │     (cUSDC)      │  │   (per market)     │  │
│  │  - Create       │  │                  │  │                    │  │
│  │  - Resolve      │  │  - Encrypted     │  │  - Encrypted       │  │
│  │  - Whitelist    │  │    balances (EC) │  │    balances (EC)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Transfer Request
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    iExec iApp (TEE Enclave)                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 Confidential Transfer Engine                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │   Decrypt    │  │   Compute    │  │    Re-encrypt    │   │    │
│  │  │   Balances   │  │   Transfer   │  │    New Balances  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │  Private Key │  │   Validate   │  │  Update On-Chain │   │    │
│  │  │  (sealed)    │  │   Amounts    │  │                  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Confidential Token Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Confidential Prediction Market (cPM)               │
│                                                                       │
│                              ┌─────────────────┐                      │
│                              │      PR1        │                      │
│                              │ ┌─────┬───────┐ │   CLOSURE PR1       │
│                              │ │cYES │ cNO   │ │ ──────────────────┐ │
│                              │ │ PR1 │ PR1   │ │      yield        │ │
│                              │ └─────┴───────┘ │                   │ │
│                              └────────▲────────┘                   │ │
│                                       │                            │ │
│    USDC        WRAPPED               │                            ▼ │
│   ────────────────────►  cUSDC ──────┴──────────────────────►  cUSDC │
│                            │                                    (2) │
│                            │         ┌─────────────────┐          │ │
│                            │         │      PR2        │          │ │
│                            │         │ ┌─────┬───────┐ │  SELL    │ │
│                            └────────►│ │cYES │ cNO   │ │──────────┘ │
│                                      │ │ PR2 │ PR2   │ │ TRANSFER   │
│                                      │ └─────┴───────┘ │            │
│                                      └─────────────────┘            │
│                                                    │                │
│                                                    ▼                │
│                                                 cUSDC ──────────► User
│                                                  (3)                │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow (Confidential Transfer)

```
1. User initie un transfert (ex: acheter cYES avec cUSDC)
2. Smart contract appelle l'iApp iExec
3. iApp dans le TEE:
   a. Dechiffre les balances source et destination avec la cle privee scellee
   b. Valide que le sender a suffisamment de fonds
   c. Calcule les nouvelles balances
   d. Re-chiffre les nouvelles balances avec la cle publique
4. iApp ecrit les nouvelles balances chiffrees on-chain
5. User peut verifier sa balance en dechiffrant localement (avec sa viewing key)
```

---

## Confidential Token Model

### Vue d'ensemble

Le systeme repose sur des **Confidential ERC20** ou les montants sont chiffres via **NaCl (TweetNaCl)**.

> **Choix MVP**: Nous utilisons NaCl plutot que des Pedersen commitments (EC-based) car:
> - **Confidentialite**: Les balances sont cachees on-chain
> - **Integrite**: Le TEE valide toutes les operations
> - **Simplicite**: NaCl est battle-tested et simple a implementer
>
> Pour une version production, on pourrait migrer vers des Pedersen commitments avec range proofs (Bulletproofs) pour permettre une verification sans TEE.

### Tokens du systeme

| Token | Description | Usage |
|-------|-------------|-------|
| **USDC** | Stablecoin standard | Depot initial par l'utilisateur |
| **cUSDC** | Confidential USDC | Collateral pour acheter cYES/cNO |
| **cYES** | Confidential YES token | Position "l'evenement se produit" |
| **cNO** | Confidential NO token | Position "l'evenement ne se produit pas" |

### Chiffrement NaCl (MVP)

Le MVP utilise **TweetNaCl** avec deux schemas de chiffrement:

| Usage | Algorithme | Type |
|-------|------------|------|
| User <-> TEE (ordres) | X25519 + XSalsa20-Poly1305 | Asymetrique (box) |
| Stockage balances | XSalsa20-Poly1305 | Symetrique (secretbox) |

```typescript
// Structure d'une balance chiffree (MVP)
interface EncryptedBalance {
  // Commitment structure pour identification on-chain
  commitment: {
    x: Hex;  // Hash-based pseudo-commitment (32 bytes)
    y: Hex;  // Hash-based pseudo-commitment (32 bytes)
  };
  // Payload chiffre contenant value + randomness
  // Chiffre avec la sealed key du TEE (XSalsa20-Poly1305)
  encryptedRandomness: Hex;
}

// Seul le TEE peut dechiffrer (possede la sealed key)
// Fresh randomness a chaque re-encryption pour eviter les pattern attacks
```

### Cycle de vie des tokens

```
1. DEPOSIT (USDC -> cUSDC)
   User: USDC ─────────────────────────────> Contract
   Contract: mint cUSDC (encrypted balance) to User

2. BUY cYES (cUSDC -> cYES)
   User envoie cUSDC au Market
   iApp TEE: decrypt, compute, re-encrypt
   User recoit cYES (encrypted balance)

3. SELL cYES (cYES -> cUSDC)
   User envoie cYES au Market
   iApp TEE: decrypt, compute, re-encrypt
   User recoit cUSDC (encrypted balance)

4. SETTLEMENT (Resolution)
   Si YES gagne: cYES -> cUSDC (1:1)
   Si NO gagne: cNO -> cUSDC (1:1)
   Les tokens perdants valent 0

5. WITHDRAW (cUSDC -> USDC)
   User burn cUSDC
   Contract: release USDC to User
```

### iApp Transfer Flow

Chaque transfert de token confidentiel declenche l'execution d'une iApp dans le TEE :

```typescript
// Reference: https://github.com/nocturne-protocol/iapp_iexec

interface TransferRequest {
  from: address;
  to: address;
  token: address;        // cUSDC, cYES, ou cNO
  encryptedAmount: bytes; // Montant chiffre (optionnel, peut etre "tout")
}

// Dans le TEE (iApp)
async function executeConfidentialTransfer(request: TransferRequest) {
  // 1. Recuperer la cle privee scellee dans l'enclave
  const privateKey = await getSealedPrivateKey();

  // 2. Dechiffrer les balances actuelles
  const fromBalance = decrypt(getEncryptedBalance(request.from), privateKey);
  const toBalance = decrypt(getEncryptedBalance(request.to), privateKey);
  const amount = decrypt(request.encryptedAmount, privateKey);

  // 3. Valider le transfert
  if (fromBalance < amount) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  // 4. Calculer les nouvelles balances
  const newFromBalance = fromBalance - amount;
  const newToBalance = toBalance + amount;

  // 5. Re-chiffrer avec la cle publique
  const newFromEncrypted = encrypt(newFromBalance, publicKey);
  const newToEncrypted = encrypt(newToBalance, publicKey);

  // 6. Mettre a jour on-chain
  await updateBalances(request.from, newFromEncrypted, request.to, newToEncrypted);
}
```

---

## Core Components

### 1. Smart Contracts (Bellecour)

#### MarketFactory.sol
```solidity
struct Market {
    bytes32 marketId;
    string question;           // "Will BTC reach $100k by Dec 2024?"
    uint256 resolutionTime;    // When market resolves
    bool resolved;
    bool outcome;              // true = YES wins, false = NO wins
    address creator;
    address cYesToken;         // Confidential YES token address
    address cNoToken;          // Confidential NO token address
}

// Core functions
function createMarket(
    string question,
    uint256 resolutionTime
) external onlyWhitelisted returns (bytes32 marketId);

function resolveMarket(bytes32 marketId, bool outcome) external onlyOracle;
function getMarketInfo(bytes32 marketId) external view returns (Market);
```

#### ConfidentialERC20.sol (Nocturne-based)
```solidity
// Reference: https://github.com/nocturne-protocol/private-token-contract

contract ConfidentialERC20 {
    // Balances chiffrees par courbe elliptique
    // Chaque balance est un point sur la courbe (2 coordonnees)
    mapping(address => bytes) public encryptedBalances;

    // Adresse de l'iApp TEE autorisee a modifier les balances
    address public teeApp;

    // Total supply (peut etre public ou chiffre selon le besoin)
    uint256 public totalSupply;

    modifier onlyTEE() {
        require(msg.sender == teeApp, "Only TEE iApp");
        _;
    }

    // Appele uniquement par l'iApp apres calcul dans le TEE
    function updateBalances(
        address from,
        bytes calldata newFromBalance,
        address to,
        bytes calldata newToBalance
    ) external onlyTEE {
        encryptedBalances[from] = newFromBalance;
        encryptedBalances[to] = newToBalance;

        emit ConfidentialTransfer(from, to);
    }

    // Deposit: USDC -> cUSDC (pour le token cUSDC uniquement)
    function deposit(uint256 amount) external {
        // Transfer USDC from user
        IERC20(usdc).transferFrom(msg.sender, address(this), amount);

        // Trigger iApp to mint encrypted balance
        // L'iApp va chiffrer le montant et l'ajouter a la balance
        emit DepositRequested(msg.sender, amount);
    }

    // Withdraw: cUSDC -> USDC
    function withdraw(bytes calldata encryptedAmount, bytes calldata proof) external {
        // L'iApp verifie et execute le withdrawal
        emit WithdrawRequested(msg.sender, encryptedAmount, proof);
    }

    event ConfidentialTransfer(address indexed from, address indexed to);
    event DepositRequested(address indexed user, uint256 amount);
    event WithdrawRequested(address indexed user, bytes encryptedAmount, bytes proof);
}
```

#### OrderQueue.sol
```solidity
contract OrderQueue {
    // Encrypted order submission - TEE processes in batches
    function submitOrder(bytes32 marketId, bytes calldata encryptedPayload) external;
    function cancelOrder(bytes32 orderId) external;
    function getUserOrders(address user) external view returns (bytes32[] memory);

    event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp);
    event OrderCancelled(bytes32 indexed orderId, address indexed user);
}
```

### 2. iApp TEE (iExec)

#### Confidential Transfer Engine
```typescript
// Reference: https://github.com/nocturne-protocol/iapp_iexec

class ConfidentialTransferEngine {
  private privateKey: PrivateKey;  // Scelle dans l'enclave

  async handleDeposit(user: address, amount: bigint) {
    // Chiffrer le montant et l'ajouter a la balance existante
    const currentBalance = await this.decryptBalance(user, 'cUSDC');
    const newBalance = currentBalance + amount;
    const encrypted = this.encrypt(newBalance);
    await this.updateOnChain(user, encrypted);
  }

  async handleBuy(user: address, isYes: boolean, encryptedAmount: bytes) {
    // 1. Dechiffrer le montant de cUSDC a depenser
    const amount = this.decrypt(encryptedAmount);

    // 2. Verifier la balance cUSDC
    const cusdcBalance = await this.decryptBalance(user, 'cUSDC');
    if (cusdcBalance < amount) throw new Error('INSUFFICIENT_BALANCE');

    // 3. Calculer le prix et la quantite de tokens a recevoir
    // (voir section Price Discovery pour les details)
    const tokensToReceive = this.calculateTokensForPrice(amount, isYes);

    // 4. Mettre a jour les balances
    await this.updateBalance(user, 'cUSDC', cusdcBalance - amount);

    const tokenType = isYes ? 'cYES' : 'cNO';
    const tokenBalance = await this.decryptBalance(user, tokenType);
    await this.updateBalance(user, tokenType, tokenBalance + tokensToReceive);
  }

  async handleSettlement(user: address, winningToken: 'cYES' | 'cNO') {
    // Convertir tous les tokens gagnants en cUSDC (1:1)
    const winningBalance = await this.decryptBalance(user, winningToken);
    const cusdcBalance = await this.decryptBalance(user, 'cUSDC');

    await this.updateBalance(user, winningToken, 0n);
    await this.updateBalance(user, 'cUSDC', cusdcBalance + winningBalance);

    // Les tokens perdants sont automatiquement sans valeur
  }
}
```

### 3. Oracle Integration (iExec Native)

```typescript
interface OracleRequest {
  marketId: string;
  question: string;
  resolutionTime: number;
}

interface OracleResponse {
  marketId: string;
  outcome: boolean;         // true = YES wins, false = NO wins
  attestation: string;      // TEE attestation of result
}
```

---

## Privacy Model

### What is Private

| Data | Visibility | Rationale |
|------|------------|-----------|
| User balances (cUSDC, cYES, cNO) | TEE only | Encrypted on-chain |
| Position sizes | User only (via viewing key) | Prevent position hunting |
| Transaction amounts | TEE only | Prevent front-running |
| Individual trades | Participants + TEE | Trade privacy |

### What is Public

| Data | Visibility | Rationale |
|------|------------|-----------|
| Market exists | Public | Discoverability |
| Market question | Public | Users need to know what they're betting on |
| Total supply (optional) | Public | Market health indicator |
| Resolution result | Public | Verifiable fairness |
| Spot price (challenge!) | See section below | Price discovery |

### Encryption Scheme (NaCl - MVP)

```
Token Balances:
- Chiffrement symetrique via XSalsa20-Poly1305 (secretbox)
- balance_encrypted = secretbox(value + randomness, sealed_key)
- Fresh randomness a chaque operation pour eviter les patterns

TEE Sealed Key:
- Cle symetrique 32 bytes scellee dans l'enclave (SGX sealing)
- Jamais exposee, meme aux operateurs iExec
- Utilisee pour chiffrer/dechiffrer les balances

User Communication:
- Box encryption (X25519 + XSalsa20-Poly1305) pour ordres
- User genere une keypair, envoie public key avec l'ordre
- TEE dechiffre avec sa secret key + user public key

Note: Pas d'operations homomorphes dans le MVP
- Le TEE dechiffre, calcule en clair, re-chiffre
- Simplifie l'implementation sans compromis de securite
```

---

## Market Mechanics

### Binary Market Structure (MVP)

Pour le MVP, chaque marche est binaire avec 2 outcomes uniquement :

```
Market ID: 0xabc123...
Question: "Will BTC reach $100k by Dec 2024?"
Outcomes: [YES, NO]

Tokens:
- cYES: Vaut 1 cUSDC si YES gagne, 0 sinon
- cNO: Vaut 1 cUSDC si NO gagne, 0 sinon

Contrainte: P(YES) + P(NO) = 1.0
- Si cYES = 0.65, alors cNO devrait valoir 0.35
```

### Position Lifecycle (Confidential)

```
1. DEPOSIT
   - User depose 100 USDC
   - Recoit 100 cUSDC (balance chiffree)
   - Personne ne voit le montant sauf le user (via viewing key)

2. BUY cYES
   - User achete cYES avec 50 cUSDC au prix spot de 0.50
   - Recoit 100 cYES (50 / 0.50)
   - Balance: 50 cUSDC, 100 cYES, 0 cNO (tout chiffre)

3. SELL cYES
   - User vend 50 cYES a 0.60
   - Recoit 30 cUSDC
   - Balance: 80 cUSDC, 50 cYES, 0 cNO

4. SETTLEMENT (YES wins)
   - Chaque cYES vaut 1 cUSDC
   - 50 cYES -> 50 cUSDC
   - Balance finale: 130 cUSDC

4b. SETTLEMENT (NO wins)
   - cYES vaut 0
   - Balance finale: 80 cUSDC (les cYES sont perdus)

5. WITHDRAW
   - User burn 130 cUSDC
   - Recoit 130 USDC
```

### Fee Structure

| Fee | Amount | Recipient |
|-----|--------|-----------|
| Trading fee | 0.5% of notional | Protocol treasury |
| Settlement fee | 0.1% of payout | Protocol treasury |
| Market creation | 10 USDC bond | Returned if resolved properly |

---

## Price Discovery Challenge

### Le probleme fondamental

> **Comment determiner le prix spot (cUSDC / cYES / cNO) alors que toutes les positions sont invisibles ?**

C'est le defi majeur de l'architecture confidential tokens. Plusieurs approches sont possibles :

### Option 1: AMM Confidentiel (Constant Product)

```
Concept:
- Pool de liquidite: cUSDC <-> cYES et cUSDC <-> cNO
- Formule: x * y = k (comme Uniswap)
- Le TEE maintient les reserves en clair dans l'enclave
- Seul le TEE connait les vraies reserves

Avantages:
- Prix automatique base sur les reserves
- Pas besoin d'order book
- Simple a implementer

Inconvenients:
- Slippage pour les gros trades
- Necessite de la liquidite initiale
- Le TEE doit exposer un prix "indicatif"

Implementation:
```typescript
class ConfidentialAMM {
  // Reserves connues uniquement dans le TEE
  private reserveUSDC: bigint;
  private reserveYES: bigint;
  private reserveNO: bigint;

  // Prix indicatif (peut etre publie)
  getIndicativePrice(): { yes: number; no: number } {
    return {
      yes: Number(this.reserveUSDC) / Number(this.reserveYES),
      no: Number(this.reserveUSDC) / Number(this.reserveNO),
    };
  }

  // Swap confidentiel
  async swapUSDCForYES(user: address, encryptedAmount: bytes) {
    const amountIn = this.decrypt(encryptedAmount);

    // Constant product formula
    const amountOut = this.getAmountOut(amountIn, this.reserveUSDC, this.reserveYES);

    // Update reserves
    this.reserveUSDC += amountIn;
    this.reserveYES -= amountOut;

    // Update user balances (encrypted)
    await this.updateUserBalances(user, -amountIn, amountOut);
  }
}
```

### Option 2: Order Book Confidentiel dans le TEE

```
Concept:
- Order book classique mais ENTIEREMENT dans le TEE
- Les ordres sont soumis chiffres
- Le matching se fait dans l'enclave
- Seul le spread (best bid/ask) est publie

Avantages:
- Price discovery classique et efficace
- Pas de slippage pour les market makers
- Compatible avec les traders pro

Inconvenients:
- Plus complexe a implementer
- Necessite un MEV-resistant ordering
- Latence potentielle

Implementation:
```typescript
class ConfidentialOrderBook {
  private bids: Map<number, Order[]>;  // price -> orders
  private asks: Map<number, Order[]>;

  // Seul le TEE connait le carnet
  // Publie uniquement le spread
  getPublicSpread(): { bestBid: number; bestAsk: number } {
    return {
      bestBid: Math.max(...this.bids.keys()),
      bestAsk: Math.min(...this.asks.keys()),
    };
  }

  async submitOrder(user: address, encryptedOrder: bytes) {
    const order = this.decrypt(encryptedOrder);
    // Matching logic dans le TEE...
  }
}
```

### Option 3: Parimutuel (Pool-based)

```
Concept:
- Tous les paris vont dans un pool commun
- Le prix final est determine par la repartition
- Pas de prix "live", seulement a la cloture

Avantages:
- Tres simple
- Pas de probleme de liquidite
- Naturellement confidentiel

Inconvenients:
- Pas de prix en temps reel
- Moins flexible pour les traders
- Moins intuitif pour les users

Implementation:
- User bet X cUSDC sur YES
- A la cloture: Total YES pool = 1000, Total NO pool = 500
- Prix implicite YES = 1500 / (1000 + 500) * (1000/1000) = 0.67
- Si YES gagne, payout = bet * (totalPool / yesPool) = X * 1.5
```

### Option 4: Hybride - AMM + Prix Oracle

```
Concept:
- AMM pour la liquidite de base
- Oracle externe pour le prix de reference
- TEE ajuste les reserves pour suivre l'oracle

Avantages:
- Prix externe fiable
- Liquidite via AMM
- Arbitrage limite

Inconvenients:
- Dependance a un oracle externe
- Peut etre manipule via l'oracle
```

### Recommandation pour MVP

**Option 1 (AMM Confidentiel)** est recommandee pour le MVP car :
1. Plus simple a implementer
2. Fournit un prix indicatif automatique
3. Pas besoin de market makers externes

### Architecture de Prix (Implementation Actuelle)

Le TEE ne met plus a jour les prix on-chain. A la place, nous utilisons une **architecture split state** ou les donnees sont separees selon leur niveau de confidentialite :

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Arweave Split State Storage                     │
│                                                                       │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐    │
│  │     PUBLIC STATE            │  │     PRIVATE STATE           │    │
│  │     (plaintext JSON)        │  │     (encrypted blob)        │    │
│  │                             │  │                             │    │
│  │  {                          │  │  NaCl secretbox encrypted:  │    │
│  │    pools: {                 │  │  {                          │    │
│  │      "0xMarketId": {        │  │    balances: {              │    │
│  │        usdc: "1000000000",  │  │      "user:token": "..."    │    │
│  │        yes: "909340000",    │  │    },                       │    │
│  │        no: "956650000"      │  │    processedOrders: [...],  │    │
│  │      }                      │  │    lastProcessedBlock: 123, │    │
│  │    },                       │  │    version: 42              │    │
│  │    version: 42,             │  │  }                          │    │
│  │    timestamp: 1706918400    │  │                             │    │
│  │  }                          │  └─────────────────────────────┘    │
│  └─────────────────────────────┘                                     │
│                                                                       │
│  Tags Arweave:                                                        │
│  - App-Name: "iPred-TEE"                                             │
│  - Type: "public-state" | "private-state"                            │
│  - Storage-Type: "public" | "private"                                │
│  - Market-Id: "0x..."                                                │
│  - State-Root: "0x..." (hash of combined state)                      │
│  - Public-State-Tx: "..." (private state links to public)            │
└─────────────────────────────────────────────────────────────────────┘
```

#### TEE Batch Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       TEE Batch Processing                           │
│                                                                      │
│  1. Fetch pending orders from OrderQueue contract                   │
│  2. Load previous state from Arweave (split state)                  │
│     a. Find latest public state via GraphQL                         │
│     b. Find corresponding private state                             │
│     c. Decrypt private state with sealed key                        │
│     d. Merge: { ...privateState, pools: publicState.pools }         │
│  3. Process orders -> Update pool reserves + balances               │
│  4. Save to Arweave (split state):                                  │
│     a. Export public state (pools only - plaintext)                 │
│     b. Export private state (balances, processedOrders)             │
│     c. Encrypt private state with sealed key                        │
│     d. Upload both to Arweave with linked tags                      │
│  5. Call batchUpdateBalances on PrivateToken contract               │
│                                                                      │
│  NO updatePrice() call needed!                                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### Client Price Fetching

```typescript
import { PriceClient, priceToPercent } from '@ipred/price-client';

const client = new PriceClient();
const prices = await client.getIndicativePrices(marketId);

// Fetches from Arweave GraphQL:
// 1. Query latest public-state transaction for market
// 2. Download pool reserves
// 3. Compute prices locally

console.log(`YES: ${priceToPercent(prices.yes)}`);  // "YES: 51.3%"
console.log(`NO: ${priceToPercent(prices.no)}`);    // "NO: 48.7%"

// Price computation formula:
// priceYes = (usdc/yes) / ((usdc/yes) + (usdc/no)) * 10000
// priceNo = (usdc/no) / ((usdc/yes) + (usdc/no)) * 10000
// Prices are on 10000 scale (5000 = 50%)
```

#### TEE State Recovery

```typescript
// TEE can fully recover state from Arweave
async function recoverState(encryption, marketId) {
  const arweave = new ArweaveStorage(wallet);

  // 1. Find latest public state
  const latestPublic = await arweave.findLatestPublicState(marketId);

  // 2. Find corresponding private state
  const privateTxId = await arweave.findPrivateStateForPublic(latestPublic.txId);

  // 3. Download and decrypt
  const publicState = await arweave.downloadPublicState(latestPublic.txId);
  const encryptedPrivate = await arweave.downloadState(privateTxId);
  const privateState = encryption.decryptState(encryptedPrivate);

  // 4. Merge and load
  const fullState = {
    ...privateState,
    pools: publicState.pools,
  };

  stateManager.loadState(fullState);
}
```

#### Avantages de l'Architecture Split State

| Avantage | Description |
|----------|-------------|
| **Gas savings** | Pas de mise a jour de prix on-chain (economie ~50k gas/batch) |
| **Source unique** | Prix derives directement des reserves du pool |
| **Decentralise** | Tout client peut calculer les prix depuis Arweave |
| **Audit trail** | Historique complet des etats du pool sur Arweave |
| **TEE Recovery** | Etat complet reconstructible depuis Arweave |
| **Privacy preservee** | Balances restent chiffrees, seuls les pools sont publics |
| **Stockage permanent** | Arweave garantit la persistance des donnees |

```
Flow MVP:
1. Creation du marche avec liquidite initiale (50/50)
2. Users swap cUSDC <-> cYES ou cUSDC <-> cNO
3. TEE sauvegarde l'etat split sur Arweave apres chaque batch
4. Clients fetching les prix depuis Arweave (pas de call on-chain)
5. A la resolution, settlement base sur l'outcome
```

#### Testing avec ArLocal

Pour le developpement et les tests, nous utilisons ArLocal (instance Arweave locale) :

```bash
# Lancer les tests avec ArLocal
node ipred-tee/scripts/test-arweave-arlocal.js

# Output:
# - Starts ArLocal server on port 1984
# - Generates test wallet with 1 AR
# - Creates test state with pool + balances
# - Uploads split state to ArLocal
# - Verifies download and price computation
# - Tests TEE state recovery
```

L'ArweaveStorage supporte une configuration custom pour ArLocal :

```typescript
const arweaveConfig = {
  host: 'localhost',
  port: 1984,
  protocol: 'http',
};

const storage = new ArweaveStorage(wallet, arweaveConfig);
```

---

## AMM Design (MVP)

### Confidential AMM Architecture

Pour le MVP, nous utilisons un AMM confidentiel base sur le modele constant product (x * y = k).

```
┌─────────────────────────────────────────────────────────────────┐
│                 Confidential AMM Pool (dans le TEE)              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Reserves (en clair dans l'enclave uniquement)              ││
│  │                                                              ││
│  │  reserveUSDC: 10,000                                        ││
│  │  reserveYES:  10,000                                        ││
│  │  reserveNO:   10,000                                        ││
│  │                                                              ││
│  │  k_YES = reserveUSDC * reserveYES = 100,000,000            ││
│  │  k_NO  = reserveUSDC * reserveNO  = 100,000,000            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Prix indicatif (publie):                                       │
│  - P(YES) = reserveUSDC / reserveYES = 1.0 (50%)               │
│  - P(NO)  = reserveUSDC / reserveNO  = 1.0 (50%)               │
│                                                                  │
│  Note: Les volumes restent confidentiels                        │
└─────────────────────────────────────────────────────────────────┘
```

### Swap Logic

```typescript
class ConfidentialAMM {
  // Reserves connues uniquement dans le TEE
  private reserveUSDC: bigint;
  private reserveYES: bigint;
  private reserveNO: bigint;

  // Constantes du pool
  private kYES: bigint;  // reserveUSDC * reserveYES
  private kNO: bigint;   // reserveUSDC * reserveNO

  // Prix indicatif publiable (sans reveler les volumes)
  getIndicativePrice(): { yes: number; no: number } {
    const priceYes = Number(this.reserveUSDC) / Number(this.reserveYES);
    const priceNo = Number(this.reserveUSDC) / Number(this.reserveNO);

    // Normalisation pour que P(YES) + P(NO) = 1
    const total = priceYes + priceNo;
    return {
      yes: priceYes / total,
      no: priceNo / total,
    };
  }

  // Acheter cYES avec cUSDC
  async buyYES(user: address, encryptedAmountIn: bytes): Promise<void> {
    // 1. Dechiffrer le montant
    const amountIn = this.decrypt(encryptedAmountIn);

    // 2. Verifier la balance cUSDC de l'utilisateur
    const userBalance = await this.decryptBalance(user, 'cUSDC');
    if (userBalance < amountIn) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // 3. Calculer le montant de cYES a recevoir (constant product)
    // newReserveUSDC = reserveUSDC + amountIn
    // newReserveYES = k / newReserveUSDC
    // amountOut = reserveYES - newReserveYES
    const newReserveUSDC = this.reserveUSDC + amountIn;
    const newReserveYES = this.kYES / newReserveUSDC;
    const amountOut = this.reserveYES - newReserveYES;

    // 4. Appliquer les frais (0.3%)
    const fee = amountOut * 3n / 1000n;
    const amountOutAfterFee = amountOut - fee;

    // 5. Mettre a jour les reserves
    this.reserveUSDC = newReserveUSDC;
    this.reserveYES = newReserveYES;

    // 6. Mettre a jour les balances utilisateur (chiffrees)
    await this.updateBalance(user, 'cUSDC', userBalance - amountIn);
    const yesBalance = await this.decryptBalance(user, 'cYES');
    await this.updateBalance(user, 'cYES', yesBalance + amountOutAfterFee);
  }

  // Vendre cYES contre cUSDC
  async sellYES(user: address, encryptedAmountIn: bytes): Promise<void> {
    const amountIn = this.decrypt(encryptedAmountIn);

    const userYesBalance = await this.decryptBalance(user, 'cYES');
    if (userYesBalance < amountIn) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // Constant product: vendre YES = ajouter YES, retirer USDC
    const newReserveYES = this.reserveYES + amountIn;
    const newReserveUSDC = this.kYES / newReserveYES;
    const amountOut = this.reserveUSDC - newReserveUSDC;

    const fee = amountOut * 3n / 1000n;
    const amountOutAfterFee = amountOut - fee;

    this.reserveYES = newReserveYES;
    this.reserveUSDC = newReserveUSDC;

    await this.updateBalance(user, 'cYES', userYesBalance - amountIn);
    const usdcBalance = await this.decryptBalance(user, 'cUSDC');
    await this.updateBalance(user, 'cUSDC', usdcBalance + amountOutAfterFee);
  }
}
```

### Initialisation du Pool

```typescript
// A la creation du marche
async function initializePool(marketId: string, initialLiquidity: bigint) {
  // Liquidity provider depose cUSDC
  // Le pool commence avec des probabilites 50/50

  const initialReserve = initialLiquidity / 2n;

  this.reserveUSDC = initialReserve;
  this.reserveYES = initialReserve;
  this.reserveNO = initialReserve;

  // k constants
  this.kYES = this.reserveUSDC * this.reserveYES;
  this.kNO = this.reserveUSDC * this.reserveNO;

  // Le LP recoit des LP tokens (aussi confidentiels)
  // Post-MVP: gestion des LP tokens
}
```

### Slippage et Impact sur le Prix

```typescript
// Calcul du slippage pour un trade
function calculateSlippage(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): number {
  // Prix spot avant trade
  const spotPrice = Number(reserveIn) / Number(reserveOut);

  // Prix effectif apres trade
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
  const effectivePrice = Number(amountIn) / Number(amountOut);

  // Slippage en %
  return ((effectivePrice - spotPrice) / spotPrice) * 100;
}

// Pour eviter les gros slippages
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const amountInWithFee = amountIn * 997n;  // 0.3% fee
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}
```

### Ce qui est Public vs Prive

| Donnee | Visibilite | Justification |
|--------|------------|---------------|
| Prix indicatif (P_YES, P_NO) | Public | Necessaire pour l'UX |
| Reserves exactes | TEE only | Evite la manipulation |
| Volume des trades | TEE only | Confidentialite |
| Balances utilisateurs | Chiffrees on-chain | Privacy |
| Montants des swaps | TEE only | Prevent front-running |

---

## Resolution & Settlement

### Resolution Flow (Confidential)

```
1. Resolution time reached
2. iExec Oracle fetches result from trusted source
3. Oracle submits result to TEE with attestation
4. TEE verifies attestation
5. TEE met a jour le statut du marche: resolved = true, outcome = YES/NO
6. Users peuvent maintenant appeler redeem()
7. Pour chaque redeem:
   - TEE dechiffre la balance cYES ou cNO de l'utilisateur
   - Si l'utilisateur a des tokens gagnants, convertit 1:1 en cUSDC
   - Les tokens perdants valent 0 (aucune action)
8. User peut withdraw cUSDC -> USDC
```

### Settlement Calculation (Confidential)

```typescript
async function settleUserPosition(user: address, outcome: boolean): Promise<void> {
  // Determiner quel token a gagne
  const winningToken = outcome ? 'cYES' : 'cNO';
  const losingToken = outcome ? 'cNO' : 'cYES';

  // Dechiffrer les balances
  const winningBalance = await this.decryptBalance(user, winningToken);
  const losingBalance = await this.decryptBalance(user, losingToken);
  const usdcBalance = await this.decryptBalance(user, 'cUSDC');

  // Tokens gagnants -> cUSDC (1:1)
  const payout = winningBalance;

  // Mettre a jour les balances (tout re-chiffre)
  await this.updateBalance(user, winningToken, 0n);
  await this.updateBalance(user, losingToken, 0n);  // Valent 0 de toute facon
  await this.updateBalance(user, 'cUSDC', usdcBalance + payout);

  // Emettre un event (sans reveler les montants)
  emit PositionSettled(user, marketId);
}
```

### Withdrawal Flow

```typescript
async function withdraw(user: address, encryptedAmount: bytes): Promise<void> {
  // 1. Dechiffrer le montant demande
  const amount = this.decrypt(encryptedAmount);

  // 2. Verifier la balance
  const balance = await this.decryptBalance(user, 'cUSDC');
  if (balance < amount) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  // 3. Bruler les cUSDC (update balance)
  await this.updateBalance(user, 'cUSDC', balance - amount);

  // 4. Transferer les USDC reels
  // L'iApp appelle le contrat pour release les USDC
  await cUsdcContract.releaseUSDC(user, amount);
}
```

### Dispute Handling (Post-MVP)

Pour le hackathon : Trust iExec oracle result
Futur : UMA-style optimistic oracle avec periode de dispute

---

## Security Model

### Trust Assumptions

| Component | Trust Level | Rationale |
|-----------|-------------|-----------|
| iExec TEE | High | Intel SGX attestation, iExec's infrastructure |
| iExec Oracle | High | Native integration, TEE-verified |
| Arbitrum | Medium | Established L2, inherits Ethereum security |
| IPFS State | Low | Encrypted, integrity via MPT roots on-chain |

### Attack Vectors & Mitigations

| Attack | Vector | Mitigation |
|--------|--------|------------|
| Front-running | See pending orders | Orders encrypted, TEE-only decryption |
| Position hunting | Identify whale positions | Positions private, only user knows |
| Order book manipulation | Spoof depth | Depth hidden, only spread visible |
| MEV extraction | Reorder transactions | Order flow invisible to validators |
| State manipulation | Alter balances | MPT root on-chain, TEE attestation |
| Replay attacks | Resubmit old orders | Nonces, timestamps, order IDs |
| TEE compromise | Extract keys | Defense in depth, attestation verification |

### Remaining Risks

| Risk | Severity | Mitigation Strategy |
|------|----------|---------------------|
| Deposit/withdrawal correlation | Medium | Fixed deposit sizes, time delays |
| Timing analysis | Low | Batch order processing |
| TEE side-channel attacks | Low | iExec's hardened runtime |
| Oracle manipulation | Medium | Multiple sources, dispute period (post-MVP) |

---

## Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Smart Contracts | Solidity 0.8.x | Standard, auditable |
| L2 Chain | iExec Bellecour Sidechain | Native iExec TEE support |
| TEE Runtime | iExec (Gramine) | Native integration, SDK |
| iApp Engine | TypeScript | Fast iteration, iExec SDK support |
| Encryption | TweetNaCl (NaCl) | Battle-tested, simple, secure |
| Key Exchange | X25519 (Curve25519) | Fast, secure ECDH |
| Symmetric Cipher | XSalsa20-Poly1305 | Authenticated encryption |
| Oracle | iExec Native Oracle | Tight integration |
| Frontend | React + Viem | Standard Web3 stack |

### NaCl Encryption Integration (MVP)

```typescript
import nacl from 'tweetnacl';

// ============================================================
// Balance Encryption (Symmetric - secretbox)
// ============================================================

function encryptBalance(value: bigint, sealedKey: Uint8Array): EncryptedBalance {
  // Generate fresh randomness for this encryption
  const randomness = nacl.randomBytes(32);

  // Create payload with value + randomness + timestamp
  const payload = JSON.stringify({
    value: value.toString(),
    r: bytesToHex(randomness),
    timestamp: Date.now(),
  });

  // Encrypt with sealed key (XSalsa20-Poly1305)
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.secretbox(payload, nonce, sealedKey);

  // Create commitment structure (hash-based for on-chain ID)
  const hash = nacl.hash(encrypted);

  return {
    commitment: { x: hash.slice(0, 32), y: hash.slice(32, 64) },
    encryptedRandomness: nonce + encrypted,
  };
}

function decryptBalance(encrypted: EncryptedBalance, sealedKey: Uint8Array): bigint {
  const nonce = encrypted.encryptedRandomness.slice(0, 24);
  const ciphertext = encrypted.encryptedRandomness.slice(24);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, sealedKey);
  const payload = JSON.parse(decrypted);

  return BigInt(payload.value);
}

// ============================================================
// Order Encryption (Asymmetric - box)
// ============================================================

function encryptOrder(order: OrderPayload, teePublicKey: Uint8Array, userSecretKey: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(24);
  const message = JSON.stringify(order);

  // X25519 key exchange + XSalsa20-Poly1305
  const encrypted = nacl.box(message, nonce, teePublicKey, userSecretKey);

  return concat(nonce, encrypted);
}

function decryptOrder(encrypted: Uint8Array, userPublicKey: Uint8Array, teeSecretKey: Uint8Array): OrderPayload {
  const nonce = encrypted.slice(0, 24);
  const ciphertext = encrypted.slice(24);

  const decrypted = nacl.box.open(ciphertext, nonce, userPublicKey, teeSecretKey);

  return JSON.parse(decrypted);
}
```

> **Future (Post-MVP)**: Migration possible vers Pedersen commitments (secp256k1) avec Bulletproofs pour:
> - Verification sans TEE (trustless)
> - Operations homomorphes sur balances chiffrees
> - Zero-knowledge proofs de solvabilite

### iApp iExec Integration

Reference: [nocturne-protocol/iapp_iexec](https://github.com/nocturne-protocol/iapp_iexec)

```typescript
// Dans l'iApp TEE
import { IExec } from 'iexec';

async function processConfidentialTransfer(taskId: string) {
  // 1. Recuperer les inputs chiffres depuis IPFS
  const inputs = await iexec.task.fetchResults(taskId);

  // 2. Dechiffrer avec la cle scellee
  const decrypted = decrypt(inputs, sealedPrivateKey);

  // 3. Executer la logique (swap, transfer, etc.)
  const result = await executeLogic(decrypted);

  // 4. Re-chiffrer et soumettre le resultat
  const encryptedResult = encrypt(result, publicKey);
  await submitResult(encryptedResult);
}
```

---

## Implementation Roadmap

### Week 1: Foundation

| Day | Task | Deliverable |
|-----|------|-------------|
| 1-2 | iExec TEE setup | Hello world dans l'enclave, SDK familiarity |
| 2 | Fork Nocturne contracts | ConfidentialERC20 (cUSDC) sur Bellecour |
| 3 | MarketFactory contract | Creation de marches binaires (cYES/cNO) |
| 4 | iApp scaffold | Skeleton iApp pour transferts confidentiels |
| 5 | Deposit/Withdraw flow | USDC -> cUSDC et inverse |
| 6 | AMM logic dans l'iApp | Constant product swap cUSDC <-> cYES/cNO |
| 7 | Integration tests | Flow complet deposit -> swap -> check balance |

### Week 2: Completion

| Day | Task | Deliverable |
|-----|------|-------------|
| 8 | Prix indicatif API | Endpoint pour recuperer P(YES), P(NO) |
| 9 | Oracle integration | iExec oracle pour resolution |
| 10 | Settlement flow | Redeem tokens gagnants -> cUSDC |
| 11 | Withdrawal complete | cUSDC -> USDC avec verification TEE |
| 12 | Simple CLI demo | Deposit, buy cYES, resolution, withdraw |
| 13 | Frontend basique | Interface React pour interagir |
| 14 | Polish & documentation | Demo script, README, video |

### MVP Scope

**Included:**
- Single binary market (YES/NO)
- Confidential tokens: cUSDC, cYES, cNO
- AMM-based pricing (constant product)
- Deposit USDC -> cUSDC
- Buy/Sell cYES et cNO via AMM
- Prix indicatif public (sans volumes)
- Market resolution via oracle
- Settlement confidentiel
- Withdraw cUSDC -> USDC

**Excluded (Post-Hackathon):**
- Multiple concurrent markets
- Order book (alternative a l'AMM)
- Liquidity Provider tokens
- Multiple outcomes (>2)
- Historical price charts
- Viewing keys pour users
- Liquidity mining
- Governance
- Mobile app

---

## API Specification

### User-Facing API

#### Submit Order
```typescript
POST /order/submit
Request: {
  marketId: string;
  encryptedPayload: string;  // Encrypted OrderPayload
  signature: string;         // User signature
}

// Encrypted payload structure (decrypted in TEE):
OrderPayload: {
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  price: number;            // 0.01 - 0.99
  amount: number;           // Collateral amount
  nonce: number;
}

Response: {
  orderId: string;
  status: 'SUBMITTED';
  timestamp: number;
}
```

#### Cancel Order
```typescript
POST /order/cancel
Request: {
  orderId: string;
  signature: string;
}

Response: {
  orderId: string;
  status: 'CANCELLED' | 'NOT_FOUND' | 'ALREADY_FILLED';
}
```

#### Get User State (Encrypted)
```typescript
GET /user/state?address={address}
Response: {
  encryptedState: string;    // Decrypt with user's private key
  stateVersion: number;
  merkleProof: string[];     // Verify against on-chain root
}

// Decrypted state structure:
UserState: {
  balance: string;
  positions: Position[];
  openOrders: Order[];
}
```

#### Get Market Info (Public)
```typescript
GET /market/{marketId}
Response: {
  marketId: string;
  question: string;
  outcomes: string[];
  resolutionTime: number;
  resolved: boolean;
  winningOutcome: number | null;
  spreads: {
    outcomeIndex: number;
    bestBid: number | null;
    bestAsk: number | null;
  }[];
  lastPrice: number[];       // Last trade price per outcome
}
```

#### Get TEE Public Key
```typescript
GET /tee/pubkey
Response: {
  publicKey: string;         // X25519 public key for order encryption
  attestation: string;       // Intel SGX attestation
}
```

#### Get Order Proof (Verification)
```typescript
GET /proof/order/{orderId}
Response: {
  exists: boolean;
  key: string;               // PMT key
  value: string | null;      // Order JSON (null if cancelled/filled)
  proof: string[];           // Merkle proof nodes
  root: string;              // State root this proof is against
  stateVersion: number;      // On-chain version for verification
}

// Client verification:
// 1. Fetch on-chain root at stateVersion
// 2. Verify proof against root
// 3. Parse value to confirm order details
```

#### Get Position Proof (Verification)
```typescript
GET /proof/position/{address}/{marketId}/{outcomeIndex}
Response: {
  exists: boolean;
  key: string;               // PMT key: user:{address}:position:{marketId}:{outcomeIdx}
  value: string | null;      // Position JSON (encrypted with user's key)
  proof: string[];           // Merkle proof nodes
  root: string;
  stateVersion: number;
}
```

#### Get State Root
```typescript
GET /state/root
Response: {
  root: string;              // Current PMT root hash
  stateVersion: number;      // Matches on-chain StateAnchor.stateVersion
  lastMatchId: string;       // Most recent match that produced this root
  timestamp: number;
}
```

#### Verify Proof (Client-Side Helper)
```typescript
POST /verify/proof
Request: {
  root: string;
  key: string;
  value: string;
  proof: string[];
}
Response: {
  valid: boolean;
  error: string | null;
}

// Note: This is a convenience endpoint. Users SHOULD verify
// proofs client-side for trustless verification.
```

### Contract Events

```solidity
// MarketFactory
event MarketCreated(bytes32 indexed marketId, string question, string[] outcomes, uint256 resolutionTime);
event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome);

// OrderQueue
event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload);
event OrderCancelled(bytes32 indexed orderId);

// PrivateToken
event BalancesUpdated(uint256 indexed batchId, bytes32 stateRoot);
event Deposit(address indexed user, uint256 amount);
event WithdrawalRequested(address indexed user, bytes32 commitmentHash);

// StateAnchor (PMT Root Commits)
event StateUpdated(uint256 indexed version, bytes32 indexed newRoot, bytes32 indexed previousRoot, bytes32 matchId);
```

---

## Open Questions

### Resolved
- Market type: Binary (YES/NO) pour MVP
- Privacy approach: Confidential ERC20 avec NaCl encryption (TweetNaCl)
- Trading mechanism: AMM (constant product)
- Chain: iExec Bellecour
- Oracle: iExec native
- Encryption: NaCl (secretbox pour balances, box pour ordres) - simple et battle-tested

### Questions Cles a Resoudre

1. **Comment determiner le prix spot quand les positions sont invisibles ?**
   - Solution MVP: AMM avec prix derive des reserves (dans le TEE)
   - Le TEE publie le prix indicatif sans reveler les volumes
   - Voir section "Price Discovery Challenge"

2. **Comment gerer les transferts confidentiels ?**
   - Chaque transfert trigger une iApp
   - L'iApp dechiffre, calcule, re-chiffre
   - Reference: https://github.com/nocturne-protocol/iapp_iexec

3. **Ou est stockee la sealed key ?**
   - Cle symetrique 32 bytes scellee dans l'enclave TEE (SGX sealing)
   - Jamais exposee, meme aux operateurs
   - Utilisee pour secretbox (balances) et comme secret key pour box (ordres)

4. **Gas sponsorship**: Qui paie pour l'execution des iApps ?
   - MVP: Protocol treasury
   - Future: Inclus dans les frais de trading

5. **Latency**: Temps d'execution d'une iApp ?
   - A benchmarker avec iExec

### Future Considerations
1. Multi-market support
2. Order book comme alternative a l'AMM
3. Viewing keys pour que les users verifient leur balance sans le TEE
4. Liquidity Provider tokens
5. Governance token et fee sharing
6. Cross-chain deposits (LayerZero)
7. Migration vers Pedersen commitments + Bulletproofs (verification trustless sans TEE)

---

## Glossary

| Term | Definition |
|------|------------|
| TEE | Trusted Execution Environment - enclave de calcul isolee |
| Confidential Token | ERC20 avec balances chiffrees via NaCl |
| cUSDC | Confidential USDC - version privee de l'USDC |
| cYES | Token confidentiel representant une position "YES" |
| cNO | Token confidentiel representant une position "NO" |
| iApp | Application iExec executee dans le TEE |
| NaCl | Networking and Cryptography Library (TweetNaCl en JS) |
| X25519 | Elliptic curve Diffie-Hellman sur Curve25519 |
| XSalsa20-Poly1305 | Cipher stream + MAC pour authenticated encryption |
| Secretbox | Chiffrement symetrique NaCl (pour balances) |
| Box | Chiffrement asymetrique NaCl (pour ordres user-TEE) |
| Sealed Key | Cle symetrique scellee dans l'enclave, inaccessible de l'exterieur |
| AMM | Automated Market Maker - market maker automatise |
| Constant Product | Formule x * y = k utilisee par les AMM (Uniswap-style) |
| Resolution | Processus de determination du resultat (YES ou NO) |
| Settlement | Processus de paiement des gagnants |
| Attestation | Preuve cryptographique de l'integrite du TEE |

---

## Sequence Diagrams

### Deposit Flow (USDC -> cUSDC)

```
┌──────┐          ┌──────────────┐         ┌─────────┐
│ User │          │ cUSDC Contract│         │ iApp TEE│
└──┬───┘          └──────┬───────┘         └────┬────┘
   │                     │                      │
   │ 1. approve(USDC)    │                      │
   │────────────────────>│                      │
   │                     │                      │
   │ 2. deposit(100 USDC)│                      │
   │────────────────────>│                      │
   │                     │                      │
   │                     │ 3. Transfer USDC     │
   │                     │ 4. emit DepositReq   │
   │                     │─────────────────────>│
   │                     │                      │
   │                     │                      │ 5. Decrypt current
   │                     │                      │    user balance
   │                     │                      │ 6. Add 100 to balance
   │                     │                      │ 7. Re-encrypt balance
   │                     │                      │
   │                     │ 8. updateBalance()   │
   │                     │<─────────────────────│
   │                     │                      │
   │ 9. Balance updated  │                      │
   │ (chiffree on-chain) │                      │
   │                     │                      │
```

### Buy cYES Flow (AMM Swap)

```
┌──────┐       ┌────────────┐       ┌─────────┐       ┌───────────┐
│ User │       │ OrderQueue │       │ iApp TEE│       │StateAnchor│
└──┬───┘       └─────┬──────┘       └────┬────┘       └─────┬─────┘
   │                 │                    │                   │
   │ 1. submitOrder  │                    │                   │
   │ (encrypted)     │                    │                   │
   │────────────────>│                    │                   │
   │                 │                    │                   │
   │                 │ 2. OrderSubmitted  │                   │
   │                 │───────────────────>│                   │
   │                 │                    │                   │
   │                 │                    │ 3. Decrypt order  │
   │                 │                    │ 4. Execute AMM    │
   │                 │                    │ 5. Update state   │
   │                 │                    │                   │
   │                 │                    │ 6. commitRoot()   │
   │                 │                    │──────────────────>│
   │                 │                    │                   │
   │ 7. Order filled │                    │                   │
   │ (state updated) │                    │                   │
   │                 │                    │                   │
```

### Market Resolution & Settlement Flow

```
┌────────┐     ┌─────────────┐     ┌─────────┐     ┌──────────────┐
│ Oracle │     │MarketFactory│     │ iApp TEE│     │cYES/cNO/cUSDC│
└───┬────┘     └──────┬──────┘     └────┬────┘     └──────┬───────┘
    │                 │                 │                 │
    │ 1. Resolution   │                 │                 │
    │ time reached    │                 │                 │
    │                 │                 │                 │
    │ 2. resolveMarket│                 │                 │
    │ (outcome=YES)   │                 │                 │
    │────────────────>│                 │                 │
    │                 │                 │                 │
    │                 │ 3. emit         │                 │
    │                 │ MarketResolved  │                 │
    │                 │                 │                 │
    │                 │                 │                 │
    │      === User calls redeem() === │                 │
    │                 │                 │                 │
    │                 │ 4. RedeemReq    │                 │
    │                 │────────────────>│                 │
    │                 │                 │                 │
    │                 │                 │ 5. Decrypt cYES │
    │                 │                 │    balance      │
    │                 │                 │ 6. cYES -> cUSDC│
    │                 │                 │    (1:1)        │
    │                 │                 │ 7. Clear cYES   │
    │                 │                 │    balance      │
    │                 │                 │                 │
    │                 │                 │ 8. updateBalance│
    │                 │                 │ (all tokens)    │
    │                 │                 │────────────────>│
    │                 │                 │                 │
    │                 │ 9. Settlement   │                 │
    │                 │ complete        │                 │
    │                 │                 │                 │
```

### Withdrawal Flow (cUSDC -> USDC)

```
┌──────┐          ┌──────────────┐         ┌─────────┐
│ User │          │ cUSDC Contract│         │ iApp TEE│
└──┬───┘          └──────┬───────┘         └────┬────┘
   │                     │                      │
   │ 1. withdraw(        │                      │
   │    encryptedAmount) │                      │
   │────────────────────>│                      │
   │                     │                      │
   │                     │ 2. emit WithdrawReq  │
   │                     │─────────────────────>│
   │                     │                      │
   │                     │                      │ 3. Decrypt amount
   │                     │                      │ 4. Verify balance
   │                     │                      │    >= amount
   │                     │                      │ 5. Deduct from
   │                     │                      │    encrypted balance
   │                     │                      │
   │                     │ 6. updateBalance()   │
   │                     │<─────────────────────│
   │                     │                      │
   │                     │ 7. releaseUSDC()     │
   │                     │<─────────────────────│
   │                     │                      │
   │ 8. Receive USDC     │                      │
   │<────────────────────│                      │
   │                     │                      │
```

---

## Error Handling & Failure Modes

### Error Categories

| Category | Severity | Examples |
|----------|----------|----------|
| User Error | Low | Insufficient balance, invalid amount |
| iApp Error | Medium | Decryption failure, computation error |
| TEE Error | High | Enclave crash, attestation failure |
| Contract Error | Critical | Balance update failed |

### User Errors

#### Insufficient Balance
```typescript
// Dans l'iApp, apres dechiffrement
async function validateTransfer(user: address, amount: bigint, token: string): Promise<void> {
  const balance = await this.decryptBalance(user, token);

  if (balance < amount) {
    throw new Error(`INSUFFICIENT_BALANCE: Required ${amount}, available ${balance}`);
  }
}
```

#### Invalid Amount
```typescript
// Validation des montants
function validateAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error('INVALID_AMOUNT: Must be positive');
  }

  if (amount > MAX_AMOUNT) {
    throw new Error('INVALID_AMOUNT: Exceeds maximum');
  }
}
```

### iApp Recovery

#### Missed Events
```typescript
// Recovery: Periodic sync from contract events
async function syncMissedEvents(): Promise<void> {
  const lastProcessedBlock = await getLastProcessedBlock();
  const currentBlock = await provider.getBlockNumber();

  const events = await contract.queryFilter(
    contract.filters.TransferRequested(),
    lastProcessedBlock + 1,
    currentBlock
  );

  for (const event of events) {
    if (!await isEventProcessed(event.transactionHash)) {
      await processEvent(event);
    }
  }

  await setLastProcessedBlock(currentBlock);
}
```

#### TEE Crash Recovery
```typescript
// L'etat est on-chain (balances chiffrees)
// Seules les reserves AMM sont dans le TEE
async function recoverAMMState(): Promise<void> {
  // 1. Lire les reserves depuis un backup chiffre (IPFS ou on-chain)
  const encryptedReserves = await getBackupReserves();

  // 2. Dechiffrer avec la sealed key
  const reserves = await decryptWithSealedKey(encryptedReserves);

  // 3. Restaurer l'etat AMM
  this.reserveUSDC = reserves.usdc;
  this.reserveYES = reserves.yes;
  this.reserveNO = reserves.no;

  // 4. Recalculer les constantes k
  this.kYES = this.reserveUSDC * this.reserveYES;
  this.kNO = this.reserveUSDC * this.reserveNO;
}
```

### Graceful Degradation

| Mode | Trigger | Behavior |
|------|---------|----------|
| Normal | All systems OK | Full functionality |
| Paused | TEE error | Reject new swaps, allow withdrawals |
| Maintenance | Critical failure | Reject all operations |

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // INSUFFICIENT_BALANCE, INVALID_AMOUNT, etc.
    message: string;        // Human-readable
    recoverable: boolean;   // Can user retry?
  };
  timestamp: number;
}
```

---

## References

- [iExec Documentation](https://docs.iex.ec/)
- [TweetNaCl.js](https://tweetnacl.js.org/) - NaCl crypto library for JavaScript
- [NaCl: Networking and Cryptography Library](https://nacl.cr.yp.to/) - Original NaCl by Daniel Bernstein
- [Polymarket Architecture](https://docs.polymarket.com/)
- [Intel SGX](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions/overview.html)
- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf) - Constant Product AMM

### Future References (Post-MVP)
- [Pedersen Commitments](https://en.wikipedia.org/wiki/Commitment_scheme) - EC-based encryption
- [Bulletproofs](https://eprint.iacr.org/2017/1066.pdf) - Range proofs for confidential transactions
- [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1) - Fast secp256k1 for JS
