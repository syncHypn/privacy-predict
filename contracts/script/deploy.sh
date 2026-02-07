#!/bin/bash
# iPred Deployment Script using cast (secure - prompts for password each time)

set -e

RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
ACCOUNT="sepolia"
DEPLOYER="0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38"
USDC="0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"

# Use deployer as TEE and Oracle for initial setup
TEE_ADDRESS="$DEPLOYER"
ORACLE_ADDRESS="$DEPLOYER"

echo "=== iPred Deployment ==="
echo "Deployer: $DEPLOYER"
echo "TEE Address: $TEE_ADDRESS"
echo "Oracle Address: $ORACLE_ADDRESS"
echo "Collateral (USDC): $USDC"
echo ""

# Step 1: Deploy MarketFactory
echo "Step 1/5: Deploying MarketFactory..."
MARKET_FACTORY=$(cast send --create \
    $(forge inspect MarketFactory bytecode) \
    --constructor-args "$ORACLE_ADDRESS" \
    --rpc-url "$RPC_URL" \
    --account "$ACCOUNT" \
    --json | jq -r '.contractAddress')

echo "MarketFactory deployed at: $MARKET_FACTORY"
sleep 2

# Step 2: Deploy OrderQueue
echo ""
echo "Step 2/5: Deploying OrderQueue..."
ORDER_QUEUE=$(cast send --create \
    $(forge inspect OrderQueue bytecode) \
    --constructor-args "$MARKET_FACTORY" \
    --rpc-url "$RPC_URL" \
    --account "$ACCOUNT" \
    --json | jq -r '.contractAddress')

echo "OrderQueue deployed at: $ORDER_QUEUE"
sleep 2

# Step 3: Deploy StateAnchor
echo ""
echo "Step 3/5: Deploying StateAnchor..."
STATE_ANCHOR=$(cast send --create \
    $(forge inspect StateAnchor bytecode) \
    --constructor-args "$TEE_ADDRESS" \
    --rpc-url "$RPC_URL" \
    --account "$ACCOUNT" \
    --json | jq -r '.contractAddress')

echo "StateAnchor deployed at: $STATE_ANCHOR"
sleep 2

# Step 4: Deploy PrivateToken
echo ""
echo "Step 4/5: Deploying PrivateToken..."
PRIVATE_TOKEN=$(cast send --create \
    $(forge inspect PrivateToken bytecode) \
    --constructor-args "$USDC" "$TEE_ADDRESS" \
    --rpc-url "$RPC_URL" \
    --account "$ACCOUNT" \
    --json | jq -r '.contractAddress')

echo "PrivateToken deployed at: $PRIVATE_TOKEN"
sleep 2

# Step 5: Whitelist deployer for market creation
echo ""
echo "Step 5/5: Whitelisting deployer for market creation..."
cast send "$MARKET_FACTORY" \
    "addToWhitelist(address)" "$DEPLOYER" \
    --rpc-url "$RPC_URL" \
    --account "$ACCOUNT"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "MarketFactory:  $MARKET_FACTORY"
echo "OrderQueue:     $ORDER_QUEUE"
echo "StateAnchor:    $STATE_ANCHOR"
echo "PrivateToken:   $PRIVATE_TOKEN"
echo ""
echo "Save these addresses! You'll need them for TEE configuration."
