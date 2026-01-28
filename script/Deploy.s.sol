// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { MarketFactory } from "../src/MarketFactory.sol";
import { OrderQueue } from "../src/OrderQueue.sol";
import { StateAnchor } from "../src/StateAnchor.sol";
import { PrivateToken } from "../src/PrivateToken.sol";

contract DeployScript is Script {
    // Arbitrum Sepolia USDC address (use actual address or deploy mock for testing)
    address constant ARBITRUM_SEPOLIA_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    function run() external {
        // Get deployer address from the broadcaster (works with --account flag)
        vm.startBroadcast();
        address deployer = msg.sender;

        // TEE address - will be set to actual iExec TEE address post-deployment
        address teeAddress = vm.envOr("TEE_ADDRESS", deployer);
        // Oracle address - will be set to actual oracle post-deployment
        address oracleAddress = vm.envOr("ORACLE_ADDRESS", deployer);
        // Collateral token - USDC on Arbitrum Sepolia
        address collateralToken = vm.envOr("COLLATERAL_TOKEN", ARBITRUM_SEPOLIA_USDC);

        console.log("Deploying iPred contracts...");
        console.log("Deployer:", deployer);
        console.log("TEE Address:", teeAddress);
        console.log("Oracle Address:", oracleAddress);
        console.log("Collateral Token:", collateralToken);

        // 1. Deploy MarketFactory
        MarketFactory marketFactory = new MarketFactory(oracleAddress);
        console.log("MarketFactory deployed at:", address(marketFactory));

        // 2. Deploy OrderQueue
        OrderQueue orderQueue = new OrderQueue(address(marketFactory));
        console.log("OrderQueue deployed at:", address(orderQueue));

        // 3. Deploy StateAnchor
        StateAnchor stateAnchor = new StateAnchor(teeAddress);
        console.log("StateAnchor deployed at:", address(stateAnchor));

        // 4. Deploy PrivateToken
        PrivateToken privateToken = new PrivateToken(collateralToken, teeAddress);
        console.log("PrivateToken deployed at:", address(privateToken));

        // 5. Setup initial configuration
        // Whitelist deployer for market creation
        marketFactory.addToWhitelist(deployer);
        console.log("Deployer whitelisted for market creation");

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("MarketFactory:", address(marketFactory));
        console.log("OrderQueue:", address(orderQueue));
        console.log("StateAnchor:", address(stateAnchor));
        console.log("PrivateToken:", address(privateToken));
        console.log("\nNext steps:");
        console.log("1. Set TEE_ADDRESS to actual iExec TEE wallet");
        console.log("2. Set ORACLE_ADDRESS to iExec oracle");
        console.log("3. Configure TEE matching engine with contract addresses");
    }
}

contract DeployMockUSDC is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        console.log("Mock USDC deployed at:", address(usdc));

        vm.stopBroadcast();
    }
}

// Mock USDC for testing on testnets without official USDC
contract MockUSDC {
    string public name = "Mock USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        _mint(msg.sender, 1_000_000 * 10 ** 6); // 1M USDC to deployer
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}
