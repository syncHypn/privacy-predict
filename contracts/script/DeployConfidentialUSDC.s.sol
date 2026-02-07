// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { ConfidentialUSDC } from "../src/ConfidentialERC20.sol";

/// @title DeployConfidentialUSDC
/// @notice Deployment script for ConfidentialUSDC (cUSDC) token
/// @dev Wraps existing MockUSDC with encrypted balances
contract DeployConfidentialUSDC is Script {
    // Deployed MockUSDC on Arbitrum Sepolia
    address constant MOCK_USDC = 0xA2ec86e965eE5932a282D500fFeB98D2908960C6;

    // TEE address for balance updates
    address constant DEFAULT_TEE = 0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B;

    function run() external {
        // Load configuration from environment
        address underlyingToken = vm.envOr("USDC_ADDRESS", MOCK_USDC);
        address teeAddress = vm.envOr("TEE_ADDRESS", DEFAULT_TEE);

        vm.startBroadcast();

        console.log("Deploying ConfidentialUSDC...");
        console.log("Underlying USDC:", underlyingToken);
        console.log("TEE Address:", teeAddress);

        // Deploy ConfidentialUSDC
        ConfidentialUSDC cUSDC = new ConfidentialUSDC(underlyingToken, teeAddress);

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("ConfidentialUSDC deployed at:", address(cUSDC));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Update TEE .env with CONFIDENTIAL_USDC_ADDRESS");
        console.log("2. Verify contract on Arbiscan:");
        console.log("");
        console.log("forge verify-contract", address(cUSDC));
        console.log("  src/ConfidentialERC20.sol:ConfidentialUSDC");
        console.log("  --constructor-args $(cast abi-encode 'constructor(address,address)'", underlyingToken, teeAddress, ")");
    }
}
