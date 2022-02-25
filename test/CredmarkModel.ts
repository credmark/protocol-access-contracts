import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { Test } from 'mocha';
import { ReadableStreamBYOBRequest } from 'stream/web';
import { CredmarkModel } from '../typechain';

describe('Credmark Model', () => {
    let credmarkModel: CredmarkModel;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let minterRole = ethers.utils.id("MINTER_ROLE");
    let pauserRole = ethers.utils.id("PAUSER_ROLE");

    const fixture = async () => {
        const credmarkModelFactory = await ethers.getContractFactory('CredmarkModel');
        return (await credmarkModelFactory.deploy()) as CredmarkModel;
    }

    beforeEach(async () => {
        credmarkModel = await waffle.loadFixture(fixture);
        [deployer, alice, bob] = await ethers.getSigners();

    });

    it('is constructed correctly', async () => {
        expect(await credmarkModel.name()).to.equal('CredmarkModel');
        expect(await credmarkModel.symbol()).to.equal('CMKm');
        expect(await credmarkModel.hasRole(minterRole, deployer.address)).to.equal(true);
        expect(await credmarkModel.hasRole(pauserRole, deployer.address)).to.equal(true);
    })

    describe('pause and unpause', () => {
        it('must be done by deployer', async () => {
            //pause by deployer
            await credmarkModel.connect(deployer).pause();
            expect(await credmarkModel.paused()).to.equal(true);
            
            //unpuase by pauser
            await credmarkModel.grantRole(pauserRole, alice.address);

            await credmarkModel.connect(alice).unpause();
            expect(await credmarkModel.paused()).to.equal(false);

        });

        it('should not be done by non-deployer', async () => {
            await expect(credmarkModel.connect(alice).pause()).to.be.reverted;
            await expect(credmarkModel.connect(alice).unpause()).to.be.reverted;

        })
    });

    describe('mint', () => {
        const TEST_SLUG = "test";
        
        it('must be done by MINTER_ROLE', async () => {
            await expect(credmarkModel.connect(alice).safeMint(alice.address, TEST_SLUG)).to.reverted;

            //grant minter role to normal user

            await credmarkModel.connect(deployer).grantRole(minterRole, alice.address);
            
            await expect(
                credmarkModel.connect(alice).safeMint
                (bob.address, TEST_SLUG)
                )
                .to.emit(credmarkModel, "LogCredmarkModelMinted");
                });


        it('emit LogCredmarkModelMinted event', async () => {
            await expect(
                credmarkModel.connect(deployer).safeMint(alice.address, TEST_SLUG)
                )
                .to.emit(credmarkModel, "LogCredmarkModelMinted")
                .withArgs(await credmarkModel.getSlugHash(TEST_SLUG));
            
        });

        it('Check if minted successfully', async () => {
            await credmarkModel.connect(deployer).safeMint(alice.address, TEST_SLUG);
            expect(await credmarkModel.balanceOf(alice.address)).to.equal(1);

        })

        it('Can not mint again using same slug', async () => {
            await credmarkModel.connect(deployer).safeMint(alice.address, TEST_SLUG);           
            
            await expect(credmarkModel.connect(deployer).safeMint(bob.address, TEST_SLUG)).to.be.revertedWith(
                'Slug already Exists'
            );
        })

        it('Check if slugHash is correct', async () => {

            await credmarkModel.connect(deployer).safeMint(alice.address, TEST_SLUG);
            
            const tokenId = await credmarkModel.tokenOfOwnerByIndex(alice.address, 0x00);

            expect(await credmarkModel.getHashById(tokenId)).to.equal(await credmarkModel.getSlugHash(TEST_SLUG));

        })
    })

}) 