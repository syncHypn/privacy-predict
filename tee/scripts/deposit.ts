/**
 * Deposit tokens to PrivateToken contract
 *
 * Usage: npx tsx scripts/deposit.ts
 *
 * Required env vars:
 *   PRIVATE_KEY - User's Ethereum private key
 *   AMOUNT - Amount to deposit in wei (default: 10 tokens)
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

const privateTokenAbi = parseAbi([
  'function deposit(uint256 amount) external',
  'function collateral() external view returns (address)',
  'function totalDeposited() external view returns (uint256)',
]);

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
]);

async function main() {
  const rpcUrl = process.env['RPC_URL'] || 'https://sepolia-rollup.arbitrum.io/rpc';
  const privateKey = process.env['PRIVATE_KEY'];
  const privateTokenAddress = process.env['PRIVATE_TOKEN_ADDRESS'] || '0x472b0f5ca34069dCB28D182dC4cA357Db5C421b5';
  const amountStr = process.env['AMOUNT'] || '10000000000000000000'; // 10 tokens default

  if (!privateKey) {
    console.error('PRIVATE_KEY env var required');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  const amount = BigInt(amountStr);

  console.log('=== Deposit ===\n');
  console.log('User:', account.address);
  console.log('PrivateToken:', privateTokenAddress);
  console.log('Amount:', amount.toString(), 'wei');

  try {
    // Get collateral token address
    const collateralAddress = await publicClient.readContract({
      address: privateTokenAddress as `0x${string}`,
      abi: privateTokenAbi,
      functionName: 'collateral',
    });
    console.log('\nCollateral token:', collateralAddress);

    // Get collateral token info
    const [symbol, decimals, balance] = await Promise.all([
      publicClient.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address],
      }),
    ]);

    console.log('Token:', symbol);
    console.log('Your balance:', balance.toString(), 'wei');

    if (balance < amount) {
      console.error(`\nInsufficient ${symbol} balance!`);
      console.error(`Required: ${amount.toString()}`);
      console.error(`Available: ${balance.toString()}`);
      console.error(`\nYou need to get some ${symbol} tokens first.`);
      process.exit(1);
    }

    // Check allowance
    const allowance = await publicClient.readContract({
      address: collateralAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, privateTokenAddress as `0x${string}`],
    });
    console.log('Current allowance:', allowance.toString(), 'wei');

    // Approve if needed
    if (allowance < amount) {
      console.log('\nApproving PrivateToken to spend tokens...');
      const approveHash = await walletClient.writeContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [privateTokenAddress as `0x${string}`, amount],
      });
      console.log('Approve tx:', approveHash);
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log('Approved!');
    }

    // Deposit
    console.log('\nDepositing...');
    const hash = await walletClient.writeContract({
      address: privateTokenAddress as `0x${string}`,
      abi: privateTokenAbi,
      functionName: 'deposit',
      args: [amount],
    });

    console.log('Transaction hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Confirmed in block:', receipt.blockNumber);

    console.log('\nDeposit successful! The TEE will process this and update your internal balance.');
    console.log('Wait for the TEE to pick up the Deposit event, then submit your order.');
  } catch (error) {
    console.error('\nFailed to deposit:', error);
    process.exit(1);
  }
}

main().catch(console.error);
