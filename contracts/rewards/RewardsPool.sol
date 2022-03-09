// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IRewardsPool.sol";

struct RecipientInfo {
    address addr;
    uint256 multiplier;
    uint256 startTime;
}

contract RewardsPool is IRewardsPool, Ownable {
    IERC20 public rewardsToken;

    uint256 public lastRewardTime;
    uint256 public emissionRate;

    bool public started;

    RecipientInfo[] public recipients;

    event PoolStarted();
    event EmissionRateChanged(uint256 emissionRate);
    event RewardsIssued(address recipient, uint256 amount);

    mapping(address => uint256) private _rewards;

    constructor(IERC20 _rewardsToken) {
        rewardsToken = _rewardsToken;
    }

    function _now() internal view returns (uint256) {
        return block.timestamp;
    }

    function start(uint256 _emissionRate) external onlyOwner {
        require(!started, "Contract Already Started");
        require(_emissionRate > 0, "Emission rate should be > 0");

        lastRewardTime = _now();
        emissionRate = _emissionRate;
        started = true;

        emit EmissionRateChanged(_emissionRate);
        emit PoolStarted();
    }

    function setEmissionRate(uint256 _emissionRate) external onlyOwner {
        require(_emissionRate > 0, "Emission rate should be > 0");

        if (emissionRate > 0) {
            issueRewards();
        }

        _emissionRate = emissionRate;

        emit EmissionRateChanged(_emissionRate);
    }

    function addRecipient(address recipient, uint256 multiplier) external onlyOwner {
        recipients.push(RecipientInfo({addr: recipient, multiplier: multiplier, startTime: _now()}));
    }

    function getLastRewardTime() external view returns (uint256) {
        return lastRewardTime;
    }

    function issueRewards() public override {
        if (!started) {
            return;
        }

        bool _rewardsAvailable = false;
        for (uint256 i = 0; i < recipients.length; i++) {
            RecipientInfo memory _recipientInfo = recipients[i];
            uint256 rewardsAmount = unissuedRewards(_recipientInfo.addr);
            if (rewardsAmount > 0) {
                _rewards[_recipientInfo.addr] = rewardsAmount;
                _rewardsAvailable = true;
            }
        }

        lastRewardTime = _now();
        if (_rewardsAvailable == false) {
            return;
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            address to = recipients[i].addr;
            uint256 rewardsAmount = _rewards[to];
            if (rewardsAmount > 0) {
                SafeERC20.safeTransfer(rewardsToken, to, rewardsAmount);
                emit RewardsIssued(to, rewardsAmount);
            }

            delete _rewards[to];
        }
    }

    function totalUnissuedRewards() public view returns (uint256 rewardsAmount) {
        if (!started || emissionRate == 0 || lastRewardTime == 0) {
            return 0;
        }

        rewardsAmount = emissionRate * (_now() - lastRewardTime);
    }

    function unissuedRewards(address recipient) public view override returns (uint256) {
        uint256 availableRewards = totalUnissuedRewards();
        if (availableRewards == 0 || recipients.length == 0) {
            return 0;
        }

        RecipientInfo memory recipientInfo;
        uint256 currentTime = _now();
        uint256 sum = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            RecipientInfo memory _recipientInfo = recipients[i];
            uint256 _startTime = _recipientInfo.startTime > lastRewardTime ? _recipientInfo.startTime : lastRewardTime;
            sum += _recipientInfo.multiplier * (currentTime - _startTime) * rewardsToken.balanceOf(_recipientInfo.addr);

            if (_recipientInfo.addr == recipient) {
                recipientInfo = _recipientInfo;
            }
        }

        require(recipientInfo.addr != address(0), "Invalid recipient");
        if (sum == 0) {
            return 0;
        }

        uint256 startTime = recipientInfo.startTime > lastRewardTime ? recipientInfo.startTime : lastRewardTime;
        return
            (recipientInfo.multiplier *
                (currentTime - startTime) *
                rewardsToken.balanceOf(recipientInfo.addr) *
                availableRewards) / sum;
    }
}
