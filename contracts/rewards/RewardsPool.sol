// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IRewardsPool.sol";

struct RecipientInfo {
    address account;
    uint256 multiplier;
    uint256 _effectiveBalance; // Only for internal use
}

contract RewardsPool is IRewardsPool, Ownable {
    IERC20 public rewardsToken;

    uint256 public lastRewardTime;
    uint256 public emissionRate;

    bool public started;

    RecipientInfo[] public recipients;

    event PoolStarted();
    event EmissionRateChanged(uint256 emissionRate);
    event RewardsIssued(address indexed recipient, uint256 amount);

    constructor(IERC20 _rewardsToken) {
        rewardsToken = _rewardsToken;
    }

    function _now() internal view returns (uint256) {
        return block.timestamp;
    }

    function start(uint256 _emissionRate) external onlyOwner {
        require(!started, "Contract Already Started");

        lastRewardTime = _now();
        emissionRate = _emissionRate;
        started = true;

        emit EmissionRateChanged(_emissionRate);
        emit PoolStarted();
    }

    function setEmissionRate(uint256 newEmissionRate) external onlyOwner {
        if (emissionRate > 0) {
            issueRewards();
        }

        emissionRate = newEmissionRate;

        emit EmissionRateChanged(emissionRate);
    }

    function addRecipient(address account, uint256 multiplier) external onlyOwner {
        /**
         * Issuing rewards to update `lastRewardTime`.
         * Otherwise we will need to maintain recipient addition time for
         * effectiveBalance (multiplier * balance) computation
         */
        issueRewards();
        recipients.push(RecipientInfo({account: account, multiplier: multiplier, _effectiveBalance: 0}));
    }

    function getLastRewardTime() external view returns (uint256) {
        return lastRewardTime;
    }

    function issueRewards() public override {
        if (!started) {
            return;
        }

        uint256 availableRewards = totalUnissuedRewards();
        lastRewardTime = _now();

        if (availableRewards == 0 || recipients.length == 0) {
            return;
        }

        uint256 factor = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            recipients[i]._effectiveBalance = recipients[i].multiplier * rewardsToken.balanceOf(recipients[i].account);
            factor += recipients[i]._effectiveBalance;
        }

        if (factor == 0) {
            return;
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 rewardsAmount = (availableRewards * recipients[i]._effectiveBalance) / factor;
            if (rewardsAmount > 0) {
                SafeERC20.safeTransfer(rewardsToken, recipients[i].account, rewardsAmount);
                emit RewardsIssued(recipients[i].account, rewardsAmount);
            }
        }
    }

    function totalUnissuedRewards() public view returns (uint256 rewardsAmount) {
        if (!started || emissionRate == 0 || lastRewardTime == 0) {
            return 0;
        }

        rewardsAmount = emissionRate * (_now() - lastRewardTime);
    }

    function unissuedRewards(address recipientAccount) public view override returns (uint256) {
        uint256 availableRewards = totalUnissuedRewards();
        if (availableRewards == 0 || recipients.length == 0) {
            return 0;
        }

        uint256 recipientMultiplier;
        uint256 sum = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            sum += recipients[i].multiplier * rewardsToken.balanceOf(recipients[i].account);

            if (recipients[i].account == recipientAccount) {
                recipientMultiplier = recipients[i].multiplier;
            }
        }

        require(recipientMultiplier > 0, "Invalid recipient");
        if (sum > 0) {
            return (availableRewards * recipientMultiplier * rewardsToken.balanceOf(recipientAccount)) / sum;
        }

        return 0;
    }
}
