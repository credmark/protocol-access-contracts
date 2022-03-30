// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract CredmarkMembershipToken is ERC721, ERC721Enumerable, ERC721Burnable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant MEMBERSHIP_ROLE = keccak256("MEMBERSHIP_ROLE");
    Counters.Counter private _tokenIdCounter;

    constructor(address credmarkMembership) ERC721("CredmarkMembershipToken", "cmkMembership") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MEMBERSHIP_ROLE, credmarkMembership);
    }

    function safeMint(address to) public onlyRole(MEMBERSHIP_ROLE) {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function burn(uint tokenId) public override onlyRole(MEMBERSHIP_ROLE) {
        _burn(tokenId);
    }

    // The following functions are overrides required by Solidity.

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}