// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IRewardsPool.sol";

contract CredmarkAccessKeySubscriptionTier is AccessControl {
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");
    uint256 private constant SECONDS_PER_MONTH = 2592000;

    IPriceOracle private oracle;

    uint256 public monthlyFeeUsdWei;
    uint256 public debtPerSecond;
    uint256 public lockupPeriodSeconds;
    uint256 public lastGlobalDebt;
    uint256 public lastGlobalDebtTimestamp;
    IERC20 public stakingToken;
    bool public subscribable;

    IRewardsPool public rewardsPool;

    uint256 private _totalStaked;
    mapping(address => uint256) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 rewardAmount);
    event GlobalDebtUpdated();

    constructor(
        address tierManager,
        address priceOracle,
        uint256 monthlyFeeUsd,
        uint256 lockupPeriod,
        address stakingTokenAddress
    ) {
        _grantRole(TIER_MANAGER, tierManager);
        _grantRole(TIER_MANAGER, msg.sender);

        oracle = IPriceOracle(priceOracle);
        monthlyFeeUsdWei = monthlyFeeUsd;
        lockupPeriodSeconds = lockupPeriod;
        stakingToken = IERC20(stakingTokenAddress);

        updateGlobalDebt();
    }

    function setMonthlyFeeUsd(uint256 newMonthlyFeeUsdWei) external onlyRole(TIER_MANAGER) {
        monthlyFeeUsdWei = newMonthlyFeeUsdWei;
        updateGlobalDebt();
    }

    function setPriceOracle(address newPriceOracle) external onlyRole(TIER_MANAGER) {
        oracle = IPriceOracle(newPriceOracle);
    }

    function setLockupPeriod(uint256 newLockupPeriod) external onlyRole(TIER_MANAGER) {
        lockupPeriodSeconds = newLockupPeriod;
    }

    function setSubscribable(bool isSubscribable) external onlyRole(TIER_MANAGER) {
        subscribable = isSubscribable;
    }

    function setRewardsPool(address newRewardsPool) external onlyRole(TIER_MANAGER) {
        rewardsPool = IRewardsPool(newRewardsPool);
    }

    function getGlobalDebt() public view returns (uint256) {
        return lastGlobalDebt + (debtPerSecond * (block.timestamp - lastGlobalDebtTimestamp));
    }

    function updateGlobalDebt() public {
        require(address(oracle) != address(0), "Oracle not set");

        lastGlobalDebt = getGlobalDebt();
        lastGlobalDebtTimestamp = block.timestamp;

        uint256 cmkPrice = oracle.getPrice();
        uint256 cmkPriceDecimals = oracle.decimals();
        require(cmkPrice != 0, "CMK price is reported 0");

        debtPerSecond = (monthlyFeeUsdWei * 10**cmkPriceDecimals) / (cmkPrice * SECONDS_PER_MONTH);

        emit GlobalDebtUpdated();
    }

    function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake 0");
        if (address(rewardsPool) != address(0)) {
            rewardsPool.issueRewards();
        }

        _totalStaked += amount;
        _balances[msg.sender] += amount;
        SafeERC20.safeTransferFrom(stakingToken, msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function rewardsEarned(address account, uint256 amount) public view returns (uint256) {
        return
            ((((_balances[account] * stakingToken.balanceOf(address(this))) / _totalStaked) - _balances[account]) *
                amount) / _balances[account];
    }

    function withdrawalAmount(address account) external view returns (uint256 amount) {
        amount = _balances[account] + rewardsEarned(account, _balances[account]);
        if (address(rewardsPool) != address(0)) {
            amount += rewardsPool.unissuedRewards(address(this));
        }
    }

    function unstake(uint256 amount) external returns (uint256) {
        require(amount > 0, "Cannot unstake 0");
        require(_balances[msg.sender] >= amount, "Amount exceeds balance");

        if (address(rewardsPool) != address(0)) {
            rewardsPool.issueRewards();
        }

        uint256 rewardsAmount = rewardsEarned(msg.sender, amount);
        uint256 withdrawAmount = amount + rewardsAmount;
        _totalStaked -= amount;
        _balances[msg.sender] -= amount;
        SafeERC20.safeTransfer(stakingToken, msg.sender, withdrawAmount);

        emit Unstaked(msg.sender, amount, rewardsAmount);

        return withdrawAmount;
    }
}
