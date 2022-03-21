// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IRewardsPool.sol";

contract CredmarkAccessKeySubscriptionTier is AccessControl {
    using SafeERC20 for IERC20;

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
    mapping(address => uint256) private _stakedAmount;

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
        _stakedAmount[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        if (address(rewardsPool) != address(0)) {
            rewardsPool.increaseBalance(amount);
        }

        emit Staked(msg.sender, amount);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _stakedAmount[account];
    }

    function _issuedRewards(address account, uint256 amount) private view returns (uint256 issuedRewardsForAmount) {
        // Any amount of staking token that is transferred outside of staking
        // to this address is considered reward. Rewards are distributed proportional
        // to amount staked. So balance+rewards for an account would be calculated as follows:
        uint256 balanceWithRewards = (_stakedAmount[account] * stakingToken.balanceOf(address(this))) / _totalStaked;
        uint256 rewards = balanceWithRewards - _stakedAmount[account];
        issuedRewardsForAmount = (rewards * amount) / _stakedAmount[account];
    }

    function withdrawalAmount(address account) external view returns (uint256 amount) {
        amount = _stakedAmount[account] + _issuedRewards(account, _stakedAmount[account]);
        if (address(rewardsPool) != address(0)) {
            amount += rewardsPool.unissuedRewards(address(this));
        }
    }

    function unstake(uint256 amount) external returns (uint256 unstakedAmount) {
        require(amount > 0, "Cannot unstake 0");
        require(_stakedAmount[msg.sender] >= amount, "Amount exceeds balance");

        if (address(rewardsPool) != address(0)) {
            rewardsPool.issueRewards();
        }

        uint256 rewardsAmount = _issuedRewards(msg.sender, amount);
        unstakedAmount = amount + rewardsAmount;
        _totalStaked -= amount;
        _stakedAmount[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, unstakedAmount);
        if (address(rewardsPool) != address(0)) {
            rewardsPool.decreaseBalance(unstakedAmount);
        }

        emit Unstaked(msg.sender, amount, rewardsAmount);
    }
}
