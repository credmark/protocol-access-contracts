import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { CredmarkValidator, MockValidatorNFTV2 } from '../typechain-types';

describe('Validator NFT', () => {
  let credmarkValidator: CredmarkValidator;
  let mockValidatorNFTV2: MockValidatorNFTV2;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let minterRole = ethers.id('MINTER_ROLE');
  let pauserRole = ethers.id('PAUSER_ROLE');

  const fixture = async () => {
    const credmarkValidatorFactory = await ethers.getContractFactory(
      'CredmarkValidator'
    );
    const credmarkValidator = await upgrades.deployProxy(
      credmarkValidatorFactory,
      [],
      // upgrades-core bundled with hardhat-upgrades 3.x cannot detect OZ 4.7-era
      // __ERC721_init/__Pausable_init calls in the initializer (both ARE called
      // in ValidatorNFT.initialize), so silence that specific check.
      { unsafeAllow: ['missing-initializer-call'] }
    );
    await credmarkValidator.waitForDeployment();
    return credmarkValidator as unknown as CredmarkValidator;
  };

  beforeEach(async () => {
    credmarkValidator = await loadFixture(fixture);
    [deployer, alice, bob] = await ethers.getSigners();
  });

  it('should initialize', async () => {
    expect(await credmarkValidator.name()).to.equal('CredmarkValidator');
    expect(await credmarkValidator.symbol()).to.equal('CMKv');
    expect(
      await credmarkValidator.hasRole(minterRole, await deployer.getAddress())
    ).to.equal(true);
    expect(
      await credmarkValidator.hasRole(pauserRole, await deployer.getAddress())
    ).to.equal(true);
  });

  describe('#pause/unpause', () => {
    it('should be done by PAUSER_ROLE', async () => {
      //pause by deployer
      expect(
        await credmarkValidator.hasRole(pauserRole, await deployer.getAddress())
      ).to.be.equal(true);
      await credmarkValidator.connect(deployer).pause();
      expect(await credmarkValidator.paused()).to.equal(true);

      //unpuase by pauser
      await credmarkValidator.grantRole(pauserRole, await alice.getAddress());

      await credmarkValidator.connect(alice).unpause();
      expect(await credmarkValidator.paused()).to.equal(false);
    });

    it('should not be done by non-deployer', async () => {
      await expect(credmarkValidator.connect(alice).pause()).to.be.reverted;
      await expect(credmarkValidator.connect(alice).unpause()).to.be.reverted;
    });
  });

  describe('#mint', () => {
    const TEST_URI = 'test';
    const tokenId = BigInt(0);

    it('should be done by MINTER_ROLE', async () => {
      await expect(
        credmarkValidator.connect(alice).safeMint(await alice.getAddress(), TEST_URI)
      ).to.be.reverted;

      //grant minter role to normal user

      await credmarkValidator
        .connect(deployer)
        .grantRole(minterRole, await alice.getAddress());

      await expect(
        credmarkValidator.connect(alice).safeMint(await bob.getAddress(), TEST_URI)
      )
        .to.emit(credmarkValidator, 'NFTMinted')
        .withArgs(tokenId);
    });

    it('should emit NFTMinted event', async () => {
      await expect(
        credmarkValidator.connect(deployer).safeMint(await alice.getAddress(), TEST_URI)
      )
        .to.emit(credmarkValidator, 'NFTMinted')
        .withArgs(tokenId);
    });

    it('should mint nft', async () => {
      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.equal(1);
    });

    it('should have token URI', async () => {
      const tokenId = BigInt(0);

      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      expect(await credmarkValidator.tokenURI(tokenId)).to.equal(
        'https://api.credmark.com/v1/meta/validator/' + TEST_URI
      );
    });
  });

  describe('#burn', () => {
    const TEST_URI = 'TEST_URI';

    it('should burn nft', async () => {
      const tokenId = BigInt(0);
      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.equal(
        BigInt(1)
      );

      await credmarkValidator.connect(alice).burn(tokenId);

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.equal(
        BigInt(0)
      );
    });

    it('should burn nft if approved', async () => {
      const tokenId = BigInt(0);
      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.equal(
        BigInt(1)
      );

      await credmarkValidator.connect(alice).approve(await bob.getAddress(), tokenId);

      await credmarkValidator.connect(bob).burn(tokenId);

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.equal(
        BigInt(0)
      );
    });

    it('should not burn if guest', async () => {
      const tokenId = BigInt(0);
      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      await expect(credmarkValidator.connect(bob).burn(tokenId)).to.be.reverted;

      expect(await credmarkValidator.balanceOf(await alice.getAddress())).to.be.equal(
        BigInt(1)
      );
    });
  });

  describe('#upgradablity', () => {
    let mockValidatorNFTV2Factory: any;
    let mockValidatorNFTV2Attached: any;
    const TEST_URI = 'Upgraded_URI';
    const tokenId = BigInt(0);

    beforeEach(async () => {
      mockValidatorNFTV2Factory = await ethers.getContractFactory(
        'MockValidatorNFTV2'
      );

      await upgrades.upgradeProxy(
        await credmarkValidator.getAddress(),
        mockValidatorNFTV2Factory,
        { unsafeAllow: ['missing-initializer-call'] }
      );
      mockValidatorNFTV2Attached = await mockValidatorNFTV2Factory.attach(
        await credmarkValidator.getAddress()
      );
    });

    it('should add custom function', async () => {
      expect(await mockValidatorNFTV2Attached.customFunction()).to.equal(true);
    });

    it('should update mint function', async () => {
      await expect(
        mockValidatorNFTV2Attached
          .connect(deployer)
          .safeMint(await alice.getAddress(), TEST_URI)
      )
        .emit(mockValidatorNFTV2Attached, 'NFTMinted')
        .withArgs(tokenId);
    });
    it('should update tokenURI() function', async () => {
      await credmarkValidator
        .connect(deployer)
        .safeMint(await alice.getAddress(), TEST_URI);

      expect(await credmarkValidator.tokenURI(0x00)).to.equal(
        'https://api.credmark.com/v2/meta/validator/' + TEST_URI
      );
    });
  });
});
