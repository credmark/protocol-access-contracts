import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { CredmarkModel } from '../typechain-types';

describe('Credmark Model', () => {
  let credmarkModel: CredmarkModel;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let minterRole = ethers.id('MINTER_ROLE');
  let pauserRole = ethers.id('PAUSER_ROLE');

  const fixture = async () => {
    const credmarkModelFactory = await ethers.getContractFactory(
      'CredmarkModel'
    );
    return (await credmarkModelFactory.deploy()) as unknown as CredmarkModel;
  };

  beforeEach(async () => {
    credmarkModel = await loadFixture(fixture);
    [deployer, alice, bob] = await ethers.getSigners();
  });

  it('should construct', async () => {
    expect(await credmarkModel.name()).to.equal('CredmarkModel');
    expect(await credmarkModel.symbol()).to.equal('CMKm');
    expect(await credmarkModel.hasRole(minterRole, await deployer.getAddress())).to.equal(
      true
    );
    expect(await credmarkModel.hasRole(pauserRole, await deployer.getAddress())).to.equal(
      true
    );
  });

  describe('#pause/unpause', () => {
    it('should be done by PAUSER_ROLE', async () => {
      //pause by deployer
      await credmarkModel.connect(deployer).pause();
      expect(await credmarkModel.paused()).to.equal(true);

      //unpuase by pauser
      await credmarkModel.grantRole(pauserRole, await alice.getAddress());

      await credmarkModel.connect(alice).unpause();
      expect(await credmarkModel.paused()).to.equal(false);
    });

    it('should not be done by non-pauser', async () => {
      await expect(credmarkModel.connect(alice).pause()).to.be.reverted;
      await expect(credmarkModel.connect(alice).unpause()).to.be.reverted;
    });
  });

  describe('#mint', () => {
    const TEST_SLUG = 'test';
    const tokenId = BigInt(1);

    it('should be done by MINTER_ROLE', async () => {
      await expect(
        credmarkModel.connect(alice).safeMint(await alice.getAddress(), TEST_SLUG)
      ).to.reverted;

      //grant minter role to normal user

      await credmarkModel
        .connect(deployer)
        .grantRole(minterRole, await alice.getAddress());

      await expect(
        credmarkModel.connect(alice).safeMint(await bob.getAddress(), TEST_SLUG)
      )
        .to.emit(credmarkModel, 'NFTMinted')
        .withArgs(tokenId, await credmarkModel.getSlugHash(TEST_SLUG));
    });

    it('should emit NFTMinted event', async () => {
      await expect(
        credmarkModel.connect(deployer).safeMint(await alice.getAddress(), TEST_SLUG)
      )
        .to.emit(credmarkModel, 'NFTMinted')
        .withArgs(tokenId, await credmarkModel.getSlugHash(TEST_SLUG));
    });

    it('should mint nft', async () => {
      await credmarkModel.connect(deployer).safeMint(await alice.getAddress(), TEST_SLUG);
      expect(await credmarkModel.balanceOf(await alice.getAddress())).to.equal(1);
    });

    it('should not mint using same slug', async () => {
      await credmarkModel.connect(deployer).safeMint(await alice.getAddress(), TEST_SLUG);

      await expect(
        credmarkModel.connect(deployer).safeMint(await bob.getAddress(), TEST_SLUG)
      ).to.be.revertedWith('Slug already Exists');
    });

    it('Check if slugHash is correct', async () => {
      await credmarkModel.connect(deployer).safeMint(await alice.getAddress(), TEST_SLUG);

      const tokenId = await credmarkModel.tokenOfOwnerByIndex(
        await alice.getAddress(),
        0x00
      );

      expect(await credmarkModel.getHashById(tokenId)).to.equal(
        await credmarkModel.getSlugHash(TEST_SLUG)
      );
    });
  });
});
