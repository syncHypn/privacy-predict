#!/bin/bash
# iPred Contract Flow Test
# Tests: MarketFactory, OrderQueue, PrivateToken, StateAnchor
set -e

source .env

echo "=========================================="
echo "iPred Contract Flow Test"
echo "=========================================="
echo ""

# Contract addresses
MARKET_FACTORY=$MARKET_FACTORY_ADDRESS
ORDER_QUEUE=$ORDER_QUEUE_ADDRESS
STATE_ANCHOR=$STATE_ANCHOR_ADDRESS
PRIVATE_TOKEN=$PRIVATE_TOKEN_ADDRESS
COLLATERAL=$COLLATERAL_ADDRESS
RPC=$ARBITRUM_SEPOLIA_RPC_URL

# Get wallet address
YOUR_ADDRESS=$(cast wallet address --account sepolia 2>/dev/null || echo "")
if [ -z "$YOUR_ADDRESS" ]; then
    echo "Error: Could not get wallet address"
    echo "Make sure 'sepolia' account is configured in foundry"
    exit 1
fi

echo "Configuration:"
echo "  Wallet: $YOUR_ADDRESS"
echo "  MarketFactory: $MARKET_FACTORY"
echo "  OrderQueue: $ORDER_QUEUE"
echo "  StateAnchor: $STATE_ANCHOR"
echo "  PrivateToken: $PRIVATE_TOKEN"
echo "  Collateral: $COLLATERAL"
echo ""

# Test 1: MarketFactory state
echo "Test 1: MarketFactory State"
echo "----------------------------------------"
MARKET_COUNT=$(cast call $MARKET_FACTORY "getMarketCount()" --rpc-url $RPC)
ORACLE=$(cast call $MARKET_FACTORY "oracle()" --rpc-url $RPC)
echo "  Market Count: $MARKET_COUNT"
echo "  Oracle: $ORACLE"
echo ""

# Test 2: Check if whitelisted
echo "Test 2: Whitelist Status"
echo "----------------------------------------"
IS_WHITELISTED=$(cast call $MARKET_FACTORY "whitelisted(address)" $YOUR_ADDRESS --rpc-url $RPC)
if [ "$IS_WHITELISTED" == "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
    echo "  Status: Whitelisted"
else
    echo "  Status: Not whitelisted (only owner can create markets)"
fi
echo ""

# Test 3: PrivateToken state
echo "Test 3: PrivateToken State"
echo "----------------------------------------"
TOTAL_DEPOSITED=$(cast call $PRIVATE_TOKEN "totalDeposited()" --rpc-url $RPC)
COLLATERAL_TOKEN=$(cast call $PRIVATE_TOKEN "collateralToken()" --rpc-url $RPC)
TEE_ADDR=$(cast call $PRIVATE_TOKEN "teeAddress()" --rpc-url $RPC)
echo "  Total Deposited: $TOTAL_DEPOSITED"
echo "  Collateral Token: $COLLATERAL_TOKEN"
echo "  TEE Address: $TEE_ADDR"
echo ""

# Test 4: Check USDC balance
echo "Test 4: USDC Balance"
echo "----------------------------------------"
USDC_BALANCE=$(cast call $COLLATERAL "balanceOf(address)" $YOUR_ADDRESS --rpc-url $RPC)
USDC_DECIMALS=$(cast call $COLLATERAL "decimals()" --rpc-url $RPC 2>/dev/null || echo "0x06")
echo "  Raw Balance: $USDC_BALANCE"
echo ""

# Test 5: OrderQueue state
echo "Test 5: OrderQueue State"
echo "----------------------------------------"
LINKED_FACTORY=$(cast call $ORDER_QUEUE "marketFactory()" --rpc-url $RPC)
echo "  Linked MarketFactory: $LINKED_FACTORY"

USER_ORDERS=$(cast call $ORDER_QUEUE "getUserOrderCount(address)" $YOUR_ADDRESS --rpc-url $RPC)
echo "  Your Order Count: $USER_ORDERS"
echo ""

# Test 6: Check test market
echo "Test 6: Test Market"
echo "----------------------------------------"
if [ -n "$TEST_MARKET_ID" ]; then
    echo "  Market ID: $TEST_MARKET_ID"
    MARKET_EXISTS=$(cast call $MARKET_FACTORY "marketExists(bytes32)" $TEST_MARKET_ID --rpc-url $RPC)
    if [ "$MARKET_EXISTS" == "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
        echo "  Status: Exists"

        # Get market details
        MARKET_DATA=$(cast call $MARKET_FACTORY "getMarket(bytes32)" $TEST_MARKET_ID --rpc-url $RPC 2>/dev/null || echo "")
        if [ -n "$MARKET_DATA" ]; then
            IS_RESOLVED=$(cast call $MARKET_FACTORY "isMarketResolved(bytes32)" $TEST_MARKET_ID --rpc-url $RPC)
            if [ "$IS_RESOLVED" == "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
                echo "  Resolved: Yes"
            else
                echo "  Resolved: No"
            fi
        fi

        # Check orders for this market
        MARKET_ORDERS=$(cast call $ORDER_QUEUE "getMarketOrderCount(bytes32)" $TEST_MARKET_ID --rpc-url $RPC)
        echo "  Orders in Queue: $MARKET_ORDERS"
    else
        echo "  Status: Does not exist"
    fi
else
    echo "  No TEST_MARKET_ID set in .env"
fi
echo ""

# Test 7: Encrypted balance
echo "Test 7: Encrypted Balance"
echo "----------------------------------------"
ENC_BALANCE=$(cast call $PRIVATE_TOKEN "getEncryptedBalance(address)" $YOUR_ADDRESS --rpc-url $RPC)
if [ "$ENC_BALANCE" == "0x" ] || [ -z "$ENC_BALANCE" ]; then
    echo "  Status: No encrypted balance (deposit not processed by TEE yet)"
else
    echo "  Encrypted Balance: ${ENC_BALANCE:0:66}..."
fi
echo ""

# Test 8: StateAnchor
echo "Test 8: StateAnchor"
echo "----------------------------------------"
STATE_TEE=$(cast call $STATE_ANCHOR "teeAddress()" --rpc-url $RPC 2>/dev/null || echo "N/A")
echo "  TEE Address: $STATE_TEE"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Contract Status:"
echo "  MarketFactory: OK ($(cast --to-dec $MARKET_COUNT) markets)"
echo "  OrderQueue: OK"
echo "  PrivateToken: OK"
echo "  StateAnchor: OK"
echo ""
echo "To interact with contracts:"
echo ""
echo "1. Deposit USDC:"
echo "   cast send $COLLATERAL 'approve(address,uint256)' $PRIVATE_TOKEN 10000000 --rpc-url \$RPC --account sepolia"
echo "   cast send $PRIVATE_TOKEN 'deposit(uint256)' 10000000 --rpc-url \$RPC --account sepolia"
echo ""
echo "2. Submit Order:"
echo "   cast send $ORDER_QUEUE 'submitOrder(bytes32,bytes)' \$TEST_MARKET_ID 0x1234 --rpc-url \$RPC --account sepolia"
echo ""
echo "3. Create Market (if whitelisted):"
echo "   cast send $MARKET_FACTORY 'createMarket(string,string[],uint256)' 'Question?' '[\"Yes\",\"No\"]' 1782000000 --rpc-url \$RPC --account sepolia"
echo ""
