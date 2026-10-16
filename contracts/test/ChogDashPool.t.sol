// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "../ChogDashPool.sol";

// Foundry cheatcodes used here (no forge-std needed)
interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}

// A plain ERC-20 like $CHOG (18 decimals, returns true)
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "balance");
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

contract ChogDashPoolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockToken chog;
    ChogDashPool pool;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);
    uint256 constant T = 300e18;              // about one ticket
    uint256 constant MON = 1760918400;        // a Monday 00:00 UTC (2025-10-20)

    function setUp() public {
        vm.warp(MON + 1 days);
        chog = new MockToken();
        pool = new ChogDashPool(address(chog));
        address[3] memory ps = [alice, bob, carol];
        for (uint256 i = 0; i < 3; i++) {
            chog.mint(ps[i], 100_000e18);
            vm.prank(ps[i]);
            chog.approve(address(pool), type(uint256).max);
        }
    }

    function eq(uint256 a, uint256 b, string memory m) internal pure { require(a == b, m); }

    function buy(address p, uint256 a) internal { vm.prank(p); pool.buyTickets(a, bytes32(uint256(1))); }

    function testWeeksStartOnMonday() public {
        vm.warp(MON - 1);
        uint256 w = pool.currentWeek();
        vm.warp(MON);
        eq(pool.currentWeek(), w + 1, "week changes at Monday 00:00 UTC");
        eq(pool.currentWeek(), (MON / 86400 + 3) / 7, "same numbering as the game (js/quests.js weekNumber)");
    }

    function testBuyAddsToThisWeeksPool() public {
        uint256 w = pool.currentWeek();
        buy(alice, T); buy(bob, 2 * T);
        eq(pool.weekPool(w), 3 * T, "pool");
        eq(chog.balanceOf(address(pool)), 3 * T, "held");
        eq(chog.balanceOf(alice), 100_000e18 - T, "paid");
    }

    function testBuyZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(ChogDashPool.BadAmount.selector);
        pool.buyTickets(0, 0);
    }

    function testBuyWithoutApprovalReverts() public {
        address dave = address(0xDA7E);
        chog.mint(dave, T);
        vm.prank(dave);
        vm.expectRevert(ChogDashPool.TransferFailed.selector);
        pool.buyTickets(T, 0);
    }

    function testCannotPayCurrentWeek() public {
        buy(alice, T);
        uint256 w = pool.currentWeek();
        address[] memory ws = new address[](1); ws[0] = alice;
        uint256[] memory am = new uint256[](1); am[0] = T;
        vm.expectRevert(ChogDashPool.WeekNotOver.selector);
        pool.payWinners(w, ws, am);
        eq(pool.available(w), 0, "nothing available for a running week");
    }

    function testPayFinishedWeekKeepsNewWeekPool() public {
        uint256 w = pool.currentWeek();
        buy(alice, 4 * T); buy(bob, 6 * T);       // last week's pool: 10 tickets
        vm.warp(MON + 7 days + 1 hours);         // the next week has started
        buy(carol, 5 * T);                        // this new week's money must stay
        eq(pool.available(w), 10 * T, "only last week's pool is available");
        address[] memory ws = new address[](2); ws[0] = bob; ws[1] = alice;
        uint256[] memory am = new uint256[](2); am[0] = 7 * T; am[1] = 3 * T;
        pool.payWinners(w, ws, am);
        eq(chog.balanceOf(bob), 100_000e18 - 6 * T + 7 * T, "bob paid");
        eq(chog.balanceOf(alice), 100_000e18 - 4 * T + 3 * T, "alice paid");
        eq(chog.balanceOf(address(pool)), 5 * T, "the running week's pool is untouched");
        eq(pool.lastPaidWeek(), w, "marked paid");
    }

    function testCannotPayMoreThanTheWeek() public {
        uint256 w = pool.currentWeek();
        buy(alice, 2 * T);
        vm.warp(MON + 7 days + 1);
        buy(bob, 50 * T);
        address[] memory ws = new address[](1); ws[0] = alice;
        uint256[] memory am = new uint256[](1); am[0] = 2 * T + 1;
        vm.expectRevert(ChogDashPool.MoreThanAvailable.selector);
        pool.payWinners(w, ws, am);
    }

    function testPaidOnceOnly() public {
        uint256 w = pool.currentWeek();
        buy(alice, 4 * T);
        vm.warp(MON + 7 days + 1);
        address[] memory ws = new address[](1); ws[0] = alice;
        uint256[] memory am = new uint256[](1); am[0] = T;
        pool.payWinners(w, ws, am);
        vm.expectRevert(ChogDashPool.WeekAlreadyPaid.selector);
        pool.payWinners(w, ws, am);
    }

    function testUnpaidPartRollsOver() public {
        uint256 w = pool.currentWeek();
        buy(alice, 10 * T);
        vm.warp(MON + 7 days + 1);
        address[] memory ws = new address[](1); ws[0] = alice;
        uint256[] memory am = new uint256[](1); am[0] = 4 * T;   // only one player: 6 tickets' worth stays
        pool.payWinners(w, ws, am);
        buy(bob, 2 * T);
        vm.warp(MON + 14 days + 1);
        eq(pool.available(w + 1), 8 * T, "rolled over 6 + new 2");
        ws[0] = bob; am[0] = 8 * T;
        pool.payWinners(w + 1, ws, am);
        eq(chog.balanceOf(address(pool)), 0, "all paid out");
    }

    function testSkipWeekRollsOver() public {
        uint256 w = pool.currentWeek();
        buy(alice, 3 * T);
        vm.warp(MON + 7 days + 1);
        pool.skipWeek(w);
        eq(pool.lastPaidWeek(), w, "skipped");
        vm.warp(MON + 14 days + 1);
        eq(pool.available(w + 1), 3 * T, "skipped pool rolls into the next week");
    }

    function testOnlyOwnerPays() public {
        uint256 w = pool.currentWeek();
        buy(alice, T);
        vm.warp(MON + 7 days + 1);
        address[] memory ws = new address[](1); ws[0] = alice;
        uint256[] memory am = new uint256[](1); am[0] = T;
        vm.prank(alice);
        vm.expectRevert(ChogDashPool.NotOwner.selector);
        pool.payWinners(w, ws, am);
        vm.prank(alice);
        vm.expectRevert(ChogDashPool.NotOwner.selector);
        pool.skipWeek(w);
        vm.prank(alice);
        vm.expectRevert(ChogDashPool.NotOwner.selector);
        pool.transferOwnership(alice);
    }

    function testWinnerListRules() public {
        uint256 w = pool.currentWeek();
        buy(alice, 20 * T);
        vm.warp(MON + 7 days + 1);
        address[] memory ws = new address[](2); ws[0] = alice; ws[1] = alice;
        uint256[] memory am = new uint256[](2); am[0] = T; am[1] = T;
        vm.expectRevert(ChogDashPool.BadWinners.selector);    // the same winner twice
        pool.payWinners(w, ws, am);
        address[] memory eleven = new address[](11);
        uint256[] memory a11 = new uint256[](11);
        for (uint256 i = 0; i < 11; i++) { eleven[i] = address(uint160(0x1000 + i)); a11[i] = 1; }
        vm.expectRevert(ChogDashPool.BadWinners.selector);    // more than 10
        pool.payWinners(w, eleven, a11);
        address[] memory one = new address[](1); one[0] = alice;
        vm.expectRevert(ChogDashPool.BadWinners.selector);    // lengths differ
        pool.payWinners(w, one, am);
        uint256[] memory zero = new uint256[](1);
        vm.expectRevert(ChogDashPool.BadWinners.selector);    // a zero payout
        pool.payWinners(w, one, zero);
    }

    function testTenWinners() public {
        uint256 w = pool.currentWeek();
        buy(alice, 100 * T);
        vm.warp(MON + 7 days + 1);
        address[] memory ws = new address[](10);
        uint256[] memory am = new uint256[](10);
        uint16[10] memory split = [2500, 1800, 1300, 1000, 800, 700, 600, 500, 400, 400];
        for (uint256 i = 0; i < 10; i++) { ws[i] = address(uint160(0x2000 + i)); am[i] = 100 * T * split[i] / 10000; }
        pool.payWinners(w, ws, am);
        eq(chog.balanceOf(ws[0]), 25 * T, "first place 25%");
        eq(chog.balanceOf(ws[9]), 4 * T, "tenth place 4%");
        eq(chog.balanceOf(address(pool)), 0, "the split adds up to 100%");
    }

    function testOwnershipTransfer() public {
        pool.transferOwnership(bob);
        eq(uint256(uint160(pool.owner())), uint256(uint160(bob)), "new owner");
        vm.expectRevert(ChogDashPool.NotOwner.selector);
        pool.transferOwnership(alice);
    }
}
