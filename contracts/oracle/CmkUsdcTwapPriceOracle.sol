// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../interfaces/IPriceOracle.sol";

contract CmkUsdcTwapPriceOracle is IPriceOracle, AccessControl {

    uint256 internal MIN_SAMPLE_LENGTH_S = 3600;
    uint256 internal X96 = 0x1000000000000000000000000;
    uint256 internal X192 = 0x1000000000000000000000000000000000000000000000000;
    uint256 internal X192_DIV_TEN_20 = 0x2f394219248446baa23d2ec729af3d61;
    uint256 internal BUFFER_LENGTH = 4;
    uint256[] internal buffer;
    uint256 internal lastSampleTimestamp;
    uint256 internal lastSampleidx;

    IUniswapV3Pool cmkUsdcPool =
        IUniswapV3Pool(0xF7a716E2df2BdE4D0BA7656c131b06b1Af68513c);

    constructor() {
        buffer = new uint256[](BUFFER_LENGTH);

        (uint160 sqrtPriceX96, , , , , , ) = cmkUsdcPool.slot0();
        for (uint256 i = 0; i < BUFFER_LENGTH; i++) {
            buffer[i] = sqrtPriceX96;
        }
    }

    function sample() public {
        if (block.timestamp > lastSampleTimestamp + MIN_SAMPLE_LENGTH_S) {
            lastSampleidx = (lastSampleidx + 1) % BUFFER_LENGTH;
            (uint160 sqrtPriceX96, , , , , , ) = cmkUsdcPool.slot0();
            buffer[lastSampleidx] = sqrtPriceX96;
            lastSampleTimestamp = block.timestamp;
        }
    }

    function getPrice() external view override returns (uint256) {
        address(this).staticcall(abi.encodeWithSignature("sample()"));
        uint256 sqrtPriceX96twap;
        for (uint256 i = 0; i < BUFFER_LENGTH; i++) {
            sqrtPriceX96twap += (buffer[i] / BUFFER_LENGTH);
        }
        return sqrtPriceX96twap**2 / X192_DIV_TEN_20;
    }

    function decimals() external pure override returns (uint8) {
        return 8;
    }
}
