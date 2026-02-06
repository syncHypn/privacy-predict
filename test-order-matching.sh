#!/bin/bash
# iPred Order Matching Test
# Tests: Submit two opposing orders for the same market
set -e

source .env

echo "=========================================="
echo "iPred Order Matching Test"
echo "=========================================="
echo ""

# Contract addresses
MARKET_FACTORY=$MARKET_FACTORY_ADDRESS
ORDER_QUEUE=$ORDER_QUEUE_ADDRESS
PRIVATE_TOKEN=$PRIVATE_TOKEN_ADDRESS
RPC=$ARBITRUM_SEPOLIA_RPC_URL

# Get wallet address from TEE signer key (for testing)
YOUR_ADDRESS=$(cast wallet address --private-key $TEE_SIGNER_PRIVATE_KEY 2>/dev/null || echo "")
if [ -z "$YOUR_ADDRESS" ]; then
    echo "Error: Could not get wallet address"
    exit 1
fi

# Use private key for transactions
PRIVATE_KEY=$TEE_SIGNER_PRIVATE_KEY

# Use the BTC 100k market
MARKET_ID=$TEST_MARKET_ID

echo "Configuration:"
echo "  Wallet: $YOUR_ADDRESS"
echo "  Market ID: $MARKET_ID"
echo "  OrderQueue: $ORDER_QUEUE"
echo ""

# Check market exists
echo "Step 1: Verify market exists"
echo "----------------------------------------"
MARKET_EXISTS=$(cast call $MARKET_FACTORY "marketExists(bytes32)" $MARKET_ID --rpc-url $RPC)
if [ "$MARKET_EXISTS" != "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
    echo "Error: Market does not exist"
    exit 1
fi
echo "  Market exists: Yes"

# Get current order count
INITIAL_COUNT=$(cast call $ORDER_QUEUE "getMarketOrderCount(bytes32)" $MARKET_ID --rpc-url $RPC)
INITIAL_COUNT_DEC=$(cast --to-dec $INITIAL_COUNT)
echo "  Current orders in market: $INITIAL_COUNT_DEC"
echo ""

# Create encrypted order payloads
# In a real scenario, these would be encrypted with TEE public key using NaCl box
# For testing, we use mock encrypted payloads that the TEE would decrypt

# Order 1: BUY YES at price 0.55 for 5 USDC
# Encrypted payload format: [side(1)][outcomeIndex(1)][price(4)][amount(8)][nonce(8)] = 22 bytes min
# We'll use a simple mock format for testing

echo "Step 2: Create order payloads"
echo "----------------------------------------"

# Generate unique nonces using timestamps
NONCE1=$(date +%s)000001
NONCE2=$(date +%s)000002

# Mock encrypted payloads (in production, these would be NaCl box encrypted)
# Format: side|outcomeIndex|price|amount|nonce encoded as hex

# Order 1: BUY YES (side=0x01, outcome=0x00, price=0.55=0x37, amount=5000000=0x4C4B40)
# Simulating encrypted data with identifiable pattern
ORDER1_PAYLOAD="0x0100370000000000004c4b40$(printf '%016x' $NONCE1)"
echo "  Order 1 (BUY YES): $ORDER1_PAYLOAD"

# Order 2: BUY NO (side=0x01, outcome=0x01, price=0.45=0x2D, amount=5000000=0x4C4B40)
ORDER2_PAYLOAD="0x01012d0000000000004c4b40$(printf '%016x' $NONCE2)"
echo "  Order 2 (BUY NO): $ORDER2_PAYLOAD"
echo ""

echo "Step 3: Submit Order 1 (BUY YES)"
echo "----------------------------------------"
ORDER1_TX=$(cast send $ORDER_QUEUE "submitOrder(bytes32,bytes)" $MARKET_ID $ORDER1_PAYLOAD --rpc-url $RPC --private-key $PRIVATE_KEY --json)
ORDER1_HASH=$(echo $ORDER1_TX | jq -r '.transactionHash')
echo "  Transaction: $ORDER1_HASH"

# Get the order ID from logs
ORDER1_RECEIPT=$(cast receipt $ORDER1_HASH --rpc-url $RPC --json)
ORDER1_LOG=$(echo $ORDER1_RECEIPT | jq -r '.logs[0].topics[1]')
echo "  Order ID: $ORDER1_LOG"
echo ""

echo "Step 4: Submit Order 2 (BUY NO)"
echo "----------------------------------------"
ORDER2_TX=$(cast send $ORDER_QUEUE "submitOrder(bytes32,bytes)" $MARKET_ID $ORDER2_PAYLOAD --rpc-url $RPC --private-key $PRIVATE_KEY --json)
ORDER2_HASH=$(echo $ORDER2_TX | jq -r '.transactionHash')
echo "  Transaction: $ORDER2_HASH"

# Get the order ID from logs
ORDER2_RECEIPT=$(cast receipt $ORDER2_HASH --rpc-url $RPC --json)
ORDER2_LOG=$(echo $ORDER2_RECEIPT | jq -r '.logs[0].topics[1]')
echo "  Order ID: $ORDER2_LOG"
echo ""

echo "Step 5: Verify orders are queued"
echo "----------------------------------------"
FINAL_COUNT=$(cast call $ORDER_QUEUE "getMarketOrderCount(bytes32)" $MARKET_ID --rpc-url $RPC)
FINAL_COUNT_DEC=$(cast --to-dec $FINAL_COUNT)
echo "  Orders in market: $FINAL_COUNT_DEC (was $INITIAL_COUNT_DEC)"
echo ""

# Get order details
echo "Step 6: Get Order Details"
echo "----------------------------------------"
if [ -n "$ORDER1_LOG" ] && [ "$ORDER1_LOG" != "null" ]; then
    echo "  Order 1 details:"
    cast call $ORDER_QUEUE "getOrder(bytes32)" $ORDER1_LOG --rpc-url $RPC 2>/dev/null | head -c 200
    echo "..."
fi
echo ""
if [ -n "$ORDER2_LOG" ] && [ "$ORDER2_LOG" != "null" ]; then
    echo "  Order 2 details:"
    cast call $ORDER_QUEUE "getOrder(bytes32)" $ORDER2_LOG --rpc-url $RPC 2>/dev/null | head -c 200
    echo "..."
fi
echo ""

echo "=========================================="
echo "Order Matching Test Summary"
echo "=========================================="
echo ""
echo "Orders Submitted:"
echo "  Order 1 (BUY YES): $ORDER1_LOG"
echo "  Order 2 (BUY NO):  $ORDER2_LOG"
echo ""
echo "These orders are now in the OrderQueue, ready for TEE processing."
echo ""
echo "In production, the TEE would:"
echo "  1. Monitor OrderSubmitted events"
echo "  2. Decrypt the order payloads using its private key"
echo "  3. Match opposing orders (BUY YES + BUY NO at complementary prices)"
echo "  4. Update user balances via PrivateToken contract"
echo "  5. Update AMM pool state"
echo ""
echo "Note: Order matching requires the TEE iApp to be running."
echo "The contracts only store encrypted orders - matching happens off-chain in the enclave."
echo ""
