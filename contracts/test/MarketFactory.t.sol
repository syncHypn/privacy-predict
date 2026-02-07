// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { MarketFactory } from "../src/MarketFactory.sol";
import { IMarketFactory } from "../src/interfaces/IMarketFactory.sol";

contract MarketFactoryTest is Test {
    MarketFactory public factory;

    address public owner = address(this);
    address public oracle = makeAddr("oracle");
    address public creator = makeAddr("creator");
    address public user = makeAddr("user");

    string public constant QUESTION = "Who will win the match?";
    string[] public outcomes;
    uint256 public resolutionTime;

    event MarketCreated(
        bytes32 indexed marketId,
        string question,
        string[] outcomes,
        uint256 resolutionTime,
        address indexed creator
    );

    event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome);

    function setUp() public {
        factory = new MarketFactory(oracle);

        outcomes.push("Team A");
        outcomes.push("Team B");
        outcomes.push("Draw");

        resolutionTime = block.timestamp + 1 days;

        // Whitelist creator
        factory.addToWhitelist(creator);
    }

    // ============ Market Creation Tests ============

    function test_CreateMarket() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        assertTrue(factory.marketExists(marketId));

        IMarketFactory.Market memory market = factory.getMarket(marketId);
        assertEq(market.question, QUESTION);
        assertEq(market.resolutionTime, resolutionTime);
        assertEq(market.creator, creator);
        assertFalse(market.resolved);
        assertEq(market.winningOutcome, 255);
    }

    function test_CreateMarket_EmitsEvent() public {
        vm.prank(creator);
        vm.expectEmit(false, false, true, true);
        emit MarketCreated(bytes32(0), QUESTION, outcomes, resolutionTime, creator);
        factory.createMarket(QUESTION, outcomes, resolutionTime);
    }

    function test_CreateMarket_OwnerCanCreate() public {
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);
        assertTrue(factory.marketExists(marketId));
    }

    function test_CreateMarket_RevertWhen_NotWhitelisted() public {
        vm.prank(user);
        vm.expectRevert(IMarketFactory.NotWhitelisted.selector);
        factory.createMarket(QUESTION, outcomes, resolutionTime);
    }

    function test_CreateMarket_RevertWhen_TooFewOutcomes() public {
        string[] memory singleOutcome = new string[](1);
        singleOutcome[0] = "Only One";

        vm.prank(creator);
        vm.expectRevert(IMarketFactory.TooFewOutcomes.selector);
        factory.createMarket(QUESTION, singleOutcome, resolutionTime);
    }

    function test_CreateMarket_RevertWhen_TooManyOutcomes() public {
        string[] memory manyOutcomes = new string[](11);
        for (uint256 i = 0; i < 11; i++) {
            manyOutcomes[i] = "Outcome";
        }

        vm.prank(creator);
        vm.expectRevert(IMarketFactory.TooManyOutcomes.selector);
        factory.createMarket(QUESTION, manyOutcomes, resolutionTime);
    }

    function test_CreateMarket_RevertWhen_InvalidResolutionTime() public {
        vm.prank(creator);
        vm.expectRevert(IMarketFactory.InvalidResolutionTime.selector);
        factory.createMarket(QUESTION, outcomes, block.timestamp);
    }

    function test_CreateMarket_RevertWhen_Paused() public {
        factory.pause();

        vm.prank(creator);
        vm.expectRevert();
        factory.createMarket(QUESTION, outcomes, resolutionTime);
    }

    // ============ Market Resolution Tests ============

    function test_ResolveMarket() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        // Fast forward past resolution time
        vm.warp(resolutionTime + 1);

        vm.prank(oracle);
        factory.resolveMarket(marketId, 0);

        assertTrue(factory.isMarketResolved(marketId));
        assertEq(factory.getWinningOutcome(marketId), 0);
    }

    function test_ResolveMarket_EmitsEvent() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        vm.warp(resolutionTime + 1);

        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, 1);
        factory.resolveMarket(marketId, 1);
    }

    function test_ResolveMarket_RevertWhen_NotOracle() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        vm.warp(resolutionTime + 1);

        vm.prank(user);
        vm.expectRevert(IMarketFactory.NotOracle.selector);
        factory.resolveMarket(marketId, 0);
    }

    function test_ResolveMarket_RevertWhen_MarketNotFound() public {
        vm.warp(resolutionTime + 1);

        vm.prank(oracle);
        vm.expectRevert(IMarketFactory.MarketNotFound.selector);
        factory.resolveMarket(bytes32(uint256(123)), 0);
    }

    function test_ResolveMarket_RevertWhen_AlreadyResolved() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        vm.warp(resolutionTime + 1);

        vm.prank(oracle);
        factory.resolveMarket(marketId, 0);

        vm.prank(oracle);
        vm.expectRevert(IMarketFactory.MarketAlreadyResolved.selector);
        factory.resolveMarket(marketId, 1);
    }

    function test_ResolveMarket_RevertWhen_NotExpired() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        vm.prank(oracle);
        vm.expectRevert(IMarketFactory.MarketNotExpired.selector);
        factory.resolveMarket(marketId, 0);
    }

    function test_ResolveMarket_RevertWhen_InvalidOutcome() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        vm.warp(resolutionTime + 1);

        vm.prank(oracle);
        vm.expectRevert(IMarketFactory.InvalidOutcome.selector);
        factory.resolveMarket(marketId, 10);
    }

    // ============ View Function Tests ============

    function test_GetOutcomes() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        string[] memory returnedOutcomes = factory.getOutcomes(marketId);
        assertEq(returnedOutcomes.length, 3);
        assertEq(returnedOutcomes[0], "Team A");
        assertEq(returnedOutcomes[1], "Team B");
        assertEq(returnedOutcomes[2], "Draw");
    }

    function test_GetMarketCount() public {
        assertEq(factory.getMarketCount(), 0);

        vm.startPrank(creator);
        factory.createMarket(QUESTION, outcomes, resolutionTime);
        assertEq(factory.getMarketCount(), 1);

        factory.createMarket("Another question", outcomes, resolutionTime + 1 days);
        assertEq(factory.getMarketCount(), 2);
        vm.stopPrank();
    }

    function test_GetMarketIdAt() public {
        vm.prank(creator);
        bytes32 marketId = factory.createMarket(QUESTION, outcomes, resolutionTime);

        assertEq(factory.getMarketIdAt(0), marketId);
    }

    // ============ Admin Function Tests ============

    function test_SetOracle() public {
        address newOracle = makeAddr("newOracle");
        factory.setOracle(newOracle);
        assertEq(factory.oracle(), newOracle);
    }

    function test_SetOracle_RevertWhen_NotOwner() public {
        vm.prank(user);
        vm.expectRevert();
        factory.setOracle(user);
    }

    function test_AddToWhitelist() public {
        assertFalse(factory.whitelisted(user));
        factory.addToWhitelist(user);
        assertTrue(factory.whitelisted(user));
    }

    function test_RemoveFromWhitelist() public {
        factory.addToWhitelist(user);
        assertTrue(factory.whitelisted(user));

        factory.removeFromWhitelist(user);
        assertFalse(factory.whitelisted(user));
    }

    function test_Pause_Unpause() public {
        factory.pause();
        assertTrue(factory.paused());

        factory.unpause();
        assertFalse(factory.paused());
    }
}
