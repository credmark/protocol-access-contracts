// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Enumerable.sol";

interface ICredmarkModel is IERC721, IERC721Enumerable {
    
    function pause() external;

    function unpause() external;

    function safeMint(address _to, string memory _slug) public ;

    function getSlugHash(string memory _slug) public pure returns (uint256);

    function getHashById(uint256 _tokenId) public view returns (uint256);

    function supportsInterface(bytes4 _interfaceId) public view returns (bool);
}
