import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, upgrades, waffle } from 'hardhat';

import { CredmarkValidator, CredmarkValidatorUpgrade } from '../typechain';
import { addListener } from 'process';

describe('Validator NFT', () => {
    let credmarkValidator: CredmarkValidator;
    let credmarkValidatorUpgrade: CredmarkValidatorUpgrade;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let minterRole = ethers.utils.id("MINTER_ROLE");
    let pauserRole = ethers.utils.id("PAUSER_ROLE");

    const fixture = async () => {
        const credmarkValidatorFactory = await ethers.getContractFactory('CredmarkValidator');
        const credmarkValidator  = await upgrades.deployProxy(credmarkValidatorFactory);
        await credmarkValidator.deployed();
        return credmarkValidator as CredmarkValidator;
    }

    beforeEach(async () => {
        credmarkValidator = await waffle.loadFixture(fixture);
        [deployer, alice, bob] = await ethers.getSigners();

    });

    it('is initialized correctly', async () => {
        expect(await credmarkValidator.name()).to.equal('CredmarkValidator');
        expect(await credmarkValidator.symbol()).to.equal('CMKv');
        expect(await credmarkValidator.hasRole(minterRole, deployer.address)).to.equal(true);
        expect(await credmarkValidator.hasRole(pauserRole, deployer.address)).to.equal(true);
    })

    describe('pause and unpause', () => {
        it('must be done by deployer', async () => {
            //pause by deployer
            await credmarkValidator.connect(deployer).pause();
            expect(await credmarkValidator.paused()).to.equal(true);
            
            //unpuase by pauser
            await credmarkValidator.grantRole(pauserRole, alice.address);

            await credmarkValidator.connect(alice).unpause();
            expect(await credmarkValidator.paused()).to.equal(false);

        });

        it('should not be done by non-deployer', async () => {
            await expect(credmarkValidator.connect(alice).pause()).to.be.reverted;
            await expect(credmarkValidator.connect(alice).unpause()).to.be.reverted;

        })
    });

    describe('mint', () => {
        const TEST_URI = "test";
        
        it('must be done by MINTER_ROLE', async () => {
            await expect(credmarkValidator.connect(alice).safeMint(alice.address, TEST_URI)).to.be.reverted;

            //grant minter role to normal user

            await credmarkValidator.connect(deployer).grantRole(minterRole, alice.address);
            
            await expect(
                credmarkValidator.connect(alice).safeMint
                (bob.address, TEST_URI)
                )
                .to.emit(credmarkValidator, "LogCredmarkValidatorMinted");
                });


        it('emit LogCredmarkValidatorMinted event', async () => {
            await expect(
                credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI)
                )
                .to.emit(credmarkValidator, "LogCredmarkValidatorMinted")                
            
        });

        it('Check if minted successfully', async () => {
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);
            
            expect(await credmarkValidator.balanceOf(alice.address)).to.equal(1);
            
            expect(await credmarkValidator.tokenURI(0x00)).to.equal("https://api.credmark.com/v1/meta/validator/" + TEST_URI);

        });

        it('check if token URI is correct', async () => {
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);
               
            expect(await credmarkValidator.tokenURI(0x00)).to.equal("https://api.credmark.com/v1/meta/validator/" + TEST_URI);
        });

    })

    describe('burn', () => {
        const TEST_URI = 'TEST_URI';
        
        it('Check if owner can  burn nft token', async () => {
            const tokenId = BigNumber.from(0);
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);

            expect(await credmarkValidator.balanceOf(alice.address)).to.equal(
                BigNumber.from(1)
            );

            await credmarkValidator.connect(alice).burn(tokenId);

            expect(await credmarkValidator.balanceOf(alice.address)).to.equal(
                BigNumber.from(0)
            )
        })


        it('Check if approved can  burn nft token', async () => {
            const tokenId = BigNumber.from(0);
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);

            expect(await credmarkValidator.balanceOf(alice.address)).to.equal(
                BigNumber.from(1)
            );

            await credmarkValidator.connect(alice).approve(bob.address, tokenId);

            await credmarkValidator.connect(bob).burn(tokenId);

            expect(await credmarkValidator.balanceOf(alice.address)).to.equal(
                BigNumber.from(0)
            )
        })

        it('Check permission to burn for guest', async () => {
            const tokenId = BigNumber.from(0);
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);

            await expect(credmarkValidator.connect(bob).burn(tokenId)).to.be.reverted;

            expect(await credmarkValidator.balanceOf(alice.address)).to.be.equal(
                BigNumber.from(1)
            );
        })
    })

    describe('upgradablity', () => {

        let credmarkValidatorUpgradeFactory : any;
        let credmarkValidatorUpgradeAttached : any;
        const TEST_URI = 'Upgraded_URI';

        beforeEach(async () => {
         
            credmarkValidatorUpgradeFactory = await ethers.getContractFactory("CredmarkValidatorUpgrade");
         
            await upgrades.upgradeProxy(credmarkValidator.address, credmarkValidatorUpgradeFactory);
            credmarkValidatorUpgradeAttached = await credmarkValidatorUpgradeFactory.attach(credmarkValidator.address);
        })

        it('check if custom function added successfully', async () => {

            expect(await credmarkValidatorUpgradeAttached.customFunction()).to.equal(true);
        })

        it('check if Mint function upgraded successfully', async () => {
            await expect(credmarkValidatorUpgradeAttached.connect(deployer).safeMint(alice.address, TEST_URI))
            .emit(credmarkValidatorUpgradeAttached, "LogCredmarkValidatorUpgradeMinted");
        })
        it('check if tokenURI() function is upgraded', async () => {
            await credmarkValidator.connect(deployer).safeMint(alice.address, TEST_URI);
               
            expect(await credmarkValidator.tokenURI(0x00)).to.equal("https://api.credmark.com/v2/meta/validator/" + TEST_URI);
        })


    })

}) 