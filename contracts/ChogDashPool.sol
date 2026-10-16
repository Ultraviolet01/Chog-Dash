// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * Chog Dash weekly prize pool.
 *
 * - Players buy tickets for ranked Chog NFT runs by paying $CHOG into this contract (buyTickets). Every token joins the
 *   pool of the week it was paid in. The game server reads the TicketsBought event to credit the tickets; `ref` ties a
 *   purchase to the server's price quote.
 * - Weeks match the game's weekly leaderboard: they start on Monday 00:00 UTC (week = (timestamp + 3 days) / 7 days).
 * - After a week ends, the owner pays its top 10 (payWinners). A week can be paid once, in order, and only from money
 *   that is not part of a later week's pool. Whatever isn't paid out stays here and rolls into later weeks.
 * - There is no other way to move tokens out: no withdraw, no fee. Every purchase and payout is a public event.
 * - The contract can't check scores: the owner sends the winners from the game's leaderboard, and anyone can compare
 *   the Payout events with that leaderboard.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ChogDashPool {
    IERC20 public immutable chog;
    address public owner;

    uint256 public constant WEEK = 7 days;
    uint256 public constant WEEK_OFFSET = 3 days;   // 1970-01-01 was a Thursday; weeks start on Monday
    uint256 public constant MAX_WINNERS = 10;
    uint256 public constant MAX_LOOKBACK = 104;     // a week can be paid up to 2 years after it ends

    mapping(uint256 => uint256) public weekPool;    // $CHOG paid in during each week
    uint256 public lastPaidWeek;                    // the latest week paid out (0 = none yet)

    event TicketsBought(address indexed player, uint256 indexed week, uint256 amount, bytes32 ref);
    event Payout(uint256 indexed week, address indexed winner, uint256 rank, uint256 amount);
    event WeekPaid(uint256 indexed week, uint256 total, uint256 winners, uint256 rolledOver);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error BadAmount();
    error TransferFailed();
    error WeekNotOver();
    error WeekAlreadyPaid();
    error WeekTooOld();
    error BadWinners();
    error MoreThanAvailable();

    bool private locked;
    modifier nonReentrant() { require(!locked); locked = true; _; locked = false; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address chogToken) {
        require(chogToken != address(0));
        chog = IERC20(chogToken);
        owner = msg.sender;
        emit OwnerChanged(address(0), msg.sender);
    }

    function currentWeek() public view returns (uint256) {
        return (block.timestamp + WEEK_OFFSET) / WEEK;
    }

    // Pays `amount` $CHOG (approved beforehand) into this week's pool.
    function buyTickets(uint256 amount, bytes32 ref) external nonReentrant {
        if (amount == 0) revert BadAmount();
        uint256 week = currentWeek();
        uint256 before = chog.balanceOf(address(this));
        _call(abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)));
        // Credit what actually arrived (in case the token ever takes a transfer fee)
        uint256 received = chog.balanceOf(address(this)) - before;
        if (received == 0) revert BadAmount();
        weekPool[week] += received;
        emit TicketsBought(msg.sender, week, received, ref);
    }

    // What paying `week` could pay out now: everything held except the pools of the weeks after it.
    function available(uint256 week) public view returns (uint256) {
        uint256 cur = currentWeek();
        if (week >= cur) return 0;
        uint256 later;
        for (uint256 w = week + 1; w <= cur; w++) later += weekPool[w];
        uint256 bal = chog.balanceOf(address(this));
        return bal > later ? bal - later : 0;
    }

    // Pays a finished week's winners (rank 1 first). At most 10, each paid once; the rest rolls over.
    function payWinners(uint256 week, address[] calldata winners, uint256[] calldata amounts) external onlyOwner nonReentrant {
        uint256 cur = currentWeek();
        if (week >= cur) revert WeekNotOver();
        if (week <= lastPaidWeek) revert WeekAlreadyPaid();
        if (cur - week > MAX_LOOKBACK) revert WeekTooOld();
        uint256 n = winners.length;
        if (n == 0 || n > MAX_WINNERS || n != amounts.length) revert BadWinners();
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            if (winners[i] == address(0) || amounts[i] == 0) revert BadWinners();
            for (uint256 j = 0; j < i; j++) if (winners[j] == winners[i]) revert BadWinners();
            total += amounts[i];
        }
        uint256 avail = available(week);
        if (total > avail) revert MoreThanAvailable();
        lastPaidWeek = week;   // before the transfers
        for (uint256 i = 0; i < n; i++) {
            _call(abi.encodeCall(IERC20.transfer, (winners[i], amounts[i])));
            emit Payout(week, winners[i], i + 1, amounts[i]);
        }
        emit WeekPaid(week, total, n, avail - total);
    }

    // Marks a finished week with no eligible players as done; its pool rolls over.
    function skipWeek(uint256 week) external onlyOwner {
        uint256 cur = currentWeek();
        if (week >= cur) revert WeekNotOver();
        if (week <= lastPaidWeek) revert WeekAlreadyPaid();
        if (cur - week > MAX_LOOKBACK) revert WeekTooOld();
        lastPaidWeek = week;
        emit WeekPaid(week, 0, 0, available(week));
    }

    // Hands the pool over to another wallet (for example a multi-signature wallet later on).
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0));
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    // ERC-20 call that accepts tokens returning nothing or true
    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = address(chog).call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
