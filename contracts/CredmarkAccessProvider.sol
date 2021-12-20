// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./CredmarkAccessKey.sol";

contract CredmarkAccessProvider {
    CredmarkAccessKey public dataAccess;

    constructor(CredmarkAccessKey _dataAccess) {
        dataAccess = _dataAccess;
    }

    function authorize(address authenticatedAddress, uint256 tokenId) external view returns (bool authorized) {
        authorized =
            authenticatedAddress == dataAccess.ownerOf(tokenId) &&
            (dataAccess.feesAccumulated(tokenId) < dataAccess.cmkValue(tokenId));
    }
}
