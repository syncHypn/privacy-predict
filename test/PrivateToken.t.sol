// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { PrivateToken } from "../src/PrivateToken.sol";
import { IPrivateToken } from "../src/interfaces/IPrivateToken.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PrivateTokenTest is Test {
    PrivateToken public privateToken;
    MockUSDC public usdc;

    address public owner = address(this);
    address public tee = makeAddr("tee");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    uint256 public constant DEPOSIT_AMOUNT = 1000 * 10 ** 6; // 1000 USDC

    event Deposit(address indexed user, uint256 amount, bytes32 indexed commitment);
    event WithdrawalRequested(address indexed user, bytes32 indexed commitmentHash);
    event WithdrawalProcessed(address indexed user, uint256 amount);
    event BalancesUpdated(uint256 indexed batchId, bytes32 stateRoot);

    function setUp() public {
        usdc = new MockUSDC();
        privateToken = new PrivateToken(address(usdc), tee);

        // Fund users
        usdc.mint(user1, 10_000 * 10 ** 6);
        usdc.mint(user2, 10_000 * 10 ** 6);
    }

    // ============ Deposit Tests ============

    function test_Deposit() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        assertEq(privateToken.totalDeposited(), DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(privateToken)), DEPOSIT_AMOUNT);
    }

    function test_Deposit_EmitsEvent() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);

        vm.expectEmit(true, false, true, true);
        emit Deposit(user1, DEPOSIT_AMOUNT, bytes32(0));
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    function test_Deposit_MultipleDeposits() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT * 3);
        privateToken.deposit(DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        assertEq(privateToken.totalDeposited(), DEPOSIT_AMOUNT * 3);
    }

    function test_Deposit_RevertWhen_ZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(IPrivateToken.InsufficientDeposit.selector);
        privateToken.deposit(0);
    }

    function test_Deposit_RevertWhen_Paused() public {
        privateToken.pause();

        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        vm.expectRevert();
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    // ============ Withdrawal Request Tests ============

    function test_RequestWithdrawal() public {
        bytes32 commitmentHash = keccak256("withdrawal-commitment");

        vm.prank(user1);
        privateToken.requestWithdrawal(commitmentHash, hex"aabbccdd");

        assertEq(privateToken.getPendingWithdrawal(user1), commitmentHash);
    }

    function test_RequestWithdrawal_EmitsEvent() public {
        bytes32 commitmentHash = keccak256("withdrawal-commitment");

        vm.prank(user1);
        vm.expectEmit(true, true, false, false);
        emit WithdrawalRequested(user1, commitmentHash);
        privateToken.requestWithdrawal(commitmentHash, hex"aabbccdd");
    }

    function test_RequestWithdrawal_RevertWhen_InvalidCommitment() public {
        vm.prank(user1);
        vm.expectRevert(IPrivateToken.InvalidCommitment.selector);
        privateToken.requestWithdrawal(bytes32(0), hex"aabbccdd");
    }

    // ============ Withdrawal Processing Tests ============

    function test_ProcessWithdrawal() public {
        // First deposit
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 withdrawAmount = 500 * 10 ** 6;
        bytes memory proof = hex"1234567890abcdef";

        uint256 balanceBefore = usdc.balanceOf(user1);

        vm.prank(tee);
        privateToken.processWithdrawal(user1, withdrawAmount, proof);

        assertEq(usdc.balanceOf(user1), balanceBefore + withdrawAmount);
        assertEq(privateToken.totalDeposited(), DEPOSIT_AMOUNT - withdrawAmount);
    }

    function test_ProcessWithdrawal_EmitsEvent() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 withdrawAmount = 500 * 10 ** 6;

        vm.prank(tee);
        vm.expectEmit(true, false, false, true);
        emit WithdrawalProcessed(user1, withdrawAmount);
        privateToken.processWithdrawal(user1, withdrawAmount, hex"aabb");
    }

    function test_ProcessWithdrawal_RevertWhen_NotTEE() public {
        vm.prank(user1);
        vm.expectRevert(IPrivateToken.NotTEE.selector);
        privateToken.processWithdrawal(user1, 100, hex"aabb");
    }

    function test_ProcessWithdrawal_RevertWhen_AlreadyProcessed() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        bytes memory proof = hex"same-proof";

        vm.startPrank(tee);
        privateToken.processWithdrawal(user1, 100, proof);

        vm.expectRevert(IPrivateToken.WithdrawalAlreadyProcessed.selector);
        privateToken.processWithdrawal(user1, 100, proof);
        vm.stopPrank();
    }

    // ============ Batch Balance Update Tests ============

    function test_BatchUpdateBalances() public {
        address[] memory users = new address[](2);
        users[0] = user1;
        users[1] = user2;

        bytes[] memory balances = new bytes[](2);
        balances[0] = hex"encrypted-balance-1";
        balances[1] = hex"encrypted-balance-2";

        bytes32 stateRoot = keccak256("state-root");

        vm.prank(tee);
        privateToken.batchUpdateBalances(users, balances, stateRoot);

        assertEq(privateToken.getEncryptedBalance(user1), balances[0]);
        assertEq(privateToken.getEncryptedBalance(user2), balances[1]);
        assertEq(privateToken.batchCounter(), 1);
    }

    function test_BatchUpdateBalances_EmitsEvent() public {
        address[] memory users = new address[](1);
        users[0] = user1;

        bytes[] memory balances = new bytes[](1);
        balances[0] = hex"aabbccdd";

        bytes32 stateRoot = keccak256("state-root");

        vm.prank(tee);
        vm.expectEmit(true, false, false, true);
        emit BalancesUpdated(1, stateRoot);
        privateToken.batchUpdateBalances(users, balances, stateRoot);
    }

    function test_BatchUpdateBalances_RevertWhen_NotTEE() public {
        address[] memory users = new address[](1);
        bytes[] memory balances = new bytes[](1);

        vm.prank(user1);
        vm.expectRevert(IPrivateToken.NotTEE.selector);
        privateToken.batchUpdateBalances(users, balances, bytes32(0));
    }

    function test_BatchUpdateBalances_RevertWhen_LengthMismatch() public {
        address[] memory users = new address[](2);
        bytes[] memory balances = new bytes[](1);

        vm.prank(tee);
        vm.expectRevert(IPrivateToken.InvalidProof.selector);
        privateToken.batchUpdateBalances(users, balances, bytes32(0));
    }

    // ============ View Function Tests ============

    function test_GetEncryptedBalance() public {
        address[] memory users = new address[](1);
        users[0] = user1;

        bytes[] memory balances = new bytes[](1);
        balances[0] = hex"my-encrypted-balance";

        vm.prank(tee);
        privateToken.batchUpdateBalances(users, balances, bytes32(0));

        assertEq(privateToken.getEncryptedBalance(user1), balances[0]);
    }

    function test_CollateralToken() public view {
        assertEq(privateToken.collateralToken(), address(usdc));
    }

    function test_IsWithdrawalProcessed() public {
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        bytes memory proof = hex"unique-proof";
        bytes32 withdrawalId = keccak256(abi.encodePacked(user1, uint256(100), proof));

        assertFalse(privateToken.isWithdrawalProcessed(withdrawalId));

        vm.prank(tee);
        privateToken.processWithdrawal(user1, 100, proof);

        assertTrue(privateToken.isWithdrawalProcessed(withdrawalId));
    }

    // ============ Admin Function Tests ============

    function test_SetTEEAddress() public {
        address newTee = makeAddr("newTee");
        privateToken.setTEEAddress(newTee);
        assertEq(privateToken.teeAddress(), newTee);
    }

    function test_SetTEEAddress_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        privateToken.setTEEAddress(user1);
    }

    function test_EmergencyWithdraw_ERC20() public {
        // First deposit some tokens
        vm.startPrank(user1);
        usdc.approve(address(privateToken), DEPOSIT_AMOUNT);
        privateToken.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        address recipient = makeAddr("recipient");
        uint256 amount = 100 * 10 ** 6;

        privateToken.emergencyWithdraw(address(usdc), recipient, amount);

        assertEq(usdc.balanceOf(recipient), amount);
    }

    function test_EmergencyWithdraw_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        privateToken.emergencyWithdraw(address(usdc), user1, 100);
    }

    function test_Pause_Unpause() public {
        privateToken.pause();
        assertTrue(privateToken.paused());

        privateToken.unpause();
        assertFalse(privateToken.paused());
    }
}
