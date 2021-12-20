# protocol-core-contracts

The smart contracts for allowing anonymous, scalable API and Infrastructure access on-chain

## Deployed addresses

Check [deploys.md](./deploys.md) for addresses of deployed contracts

## Environment

Environment variables can be passed via `.env` file ([dotenv](https://www.npmjs.com/package/dotenv)) or by command line. Hardhat requires the following env variables:

- `INFURA_API_KEY` (mandatory)
- `ETHERSCAN_API_KEY` (mandatory when verifying contracts)

One of the following is required when deploying contracts

- `ACCOUNT_MNEMONIC`
- `ACCOUNT_PRIVATE_KEY`

## Scripts

- `npm run compile` -> Compiles all contracts to generates ABIs and typescript types
- `npm test` -> Runs all tests in test/ directory
- `npm run test:gas` -> Runs all tests in test/ directory and displays gas usage
