# SecureRoll

SecureRoll is a privacy-first on-chain dice game built with Zama FHEVM. Players buy encrypted points with ETH, start a
round to receive a confidential dice roll, and submit an encrypted guess (big or small). The game resolves entirely
on-chain while keeping balances, rolls, and guesses encrypted.

This repository includes the smart contract, deployment tooling, tests, and a React + Vite frontend that integrates
with the Zama relayer SDK for encrypted inputs.

## Project Goals

- Deliver a verifiable dice game where the outcome is enforced on-chain.
- Keep user balances, guesses, and outcomes confidential via FHE.
- Provide a simple, wallet-based UI with no server-side custody or user accounts.
- Demonstrate an end-to-end FHEVM application with production-grade structure and documentation.

## Game Rules and Economy

- Exchange rate: `1 ETH = 100,000 points` (encrypted, stored as `euint64`).
- Start a round: the contract draws a random roll in the range `1..6` (encrypted, stored as `euint8`).
- Guess encoding:
  - `1` = Big (roll is 4, 5, or 6)
  - `2` = Small (roll is 1, 2, or 3)
- Win reward: `10,000 points` (encrypted).
- Each player can have only one active round at a time.

## Why It Matters

Public blockchains are transparent by default. For games, this often forces a tradeoff between fairness and privacy.
SecureRoll solves that by using FHE to keep critical game state encrypted on-chain while still allowing the contract
to enforce the rules.

## Advantages

- Confidential state: balances, rolls, and rewards are never stored in plaintext.
- Fairness by design: outcomes are computed on-chain using FHEVM randomness.
- Trust minimization: no off-chain server decides results or holds balances.
- Verifiable logic: the entire game flow is auditable in Solidity.
- Player-controlled access: encrypted state is explicitly shared with the player via `FHE.allow`.

## Problems Solved

- Prevents leakage of player strategies and outcomes in public mempools.
- Removes the need for centralized randomness or backend game servers.
- Preserves auditability while protecting sensitive user state.
- Avoids account systems and custody risks by using wallets directly.

## Technology Stack

- **Smart contracts**: Solidity `^0.8.24`, FHEVM `@fhevm/solidity`
- **Framework**: Hardhat
- **Frontend**: React + Vite (no Tailwind)
- **Wallet UX**: RainbowKit / wallet connectors
- **Blockchain reads**: viem
- **Blockchain writes**: ethers
- **Encryption relayer**: `@zama-fhe/relayer-sdk`
- **Package manager**: npm

## Repository Layout

```
contracts/              FHE-enabled smart contracts
  SecureRoll.sol        Core game contract
  FHECounter.sol        Utility/demo contract

deploy/                 Hardhat deployment scripts

tasks/                  Hardhat custom tasks

test/                   Hardhat tests

ui/                     Frontend application (React + Vite)

hardhat.config.ts       Hardhat configuration
```

## Smart Contract Overview

Contract: `SecureRoll.sol`

- `POINTS_PER_ETH`: exchange rate constant
- `WIN_REWARD`: reward constant
- `buyPoints()`: purchase encrypted points with ETH
- `startGame()`: generate an encrypted dice roll and open a round
- `submitGuess(externalEuint8, bytes)`: submit encrypted guess and resolve reward
- `quotePoints(uint256)`: deterministic quote for ETH -> points
- `hasActiveRound(address)`: public round state
- `getEncryptedPoints(address)`: encrypted balance
- `getLastEncryptedDice(address)`: encrypted last roll
- `getLastEncryptedWin(address)`: encrypted last outcome
- `getLastEncryptedReward(address)`: encrypted last reward

Events:

- `PointsPurchased(player, weiAmount, points)`
- `GameStarted(player, diceHandle)`
- `GuessSubmitted(player, rewardHandle)`

## Privacy Model

- All balances and game outcomes are stored as encrypted types (`euint64`, `euint8`, `ebool`).
- Randomness is generated on-chain with `FHE.randEuint8()` and mapped to `1..6` via modulo and offset.
- Player access to encrypted values is granted explicitly using `FHE.allow`.
- View methods accept an explicit `player` address and do not rely on implicit caller state.

## Frontend Behavior

- The UI is wallet-based and uses RainbowKit for connection.
- Reads use viem, writes use ethers.
- Encrypted inputs are created via the Zama relayer SDK.
- The app is stateless across reloads and does not rely on browser persistence.
- The contract address is provided through the URL query parameter `?contract=0x...`.
- The frontend does not use environment variables or JSON ABI imports.

## Setup and Installation

### Prerequisites

- Node.js 20+
- npm
- A funded wallet for Sepolia deployment

### Install Dependencies

```bash
npm install
```

### Environment Configuration

Create or update `.env` in the project root:

- `PRIVATE_KEY` (without `0x` prefix)
- `INFURA_API_KEY` (optional)
- `ETHERSCAN_API_KEY` (optional)

Only private key based deployment is supported. Do not use a mnemonic.

## Compile and Test

```bash
npm run compile
npm run test
```

## Local Deployment (Required Before Sepolia)

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

## Sepolia Deployment

```bash
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Frontend Setup

1. Copy the ABI from the deployed contract to the frontend.
   - Source: `deployments/sepolia/SecureRoll.json`
   - Target: `ui/src/config/secureRollAbi.ts` (ABI array only, no JSON file usage in UI)
2. Start the UI:

```bash
cd ui
npm run dev
```

3. Open the URL printed by Vite and append the contract address:

```
?contract=0xYourDeployedAddress
```

## Usage Flow

1. Connect a wallet on Sepolia.
2. Buy points with ETH.
3. Start a game round.
4. Submit an encrypted guess (Big = `1`, Small = `2`).
5. Read your encrypted balance and last result.

## Testing Notes

- Hardhat tests validate encrypted arithmetic and game flow.
- Tasks under `tasks/` can be used for scripted checks before deployment.

## Roadmap

- Multi-round sessions with configurable wager sizes.
- Optional on-chain leaderboard using encrypted comparisons.
- UI improvements for clearer round states and encrypted result previews.
- More wallet connectors and localized UI text.
- Gas and storage optimization for encrypted state.
- Additional game modes (exact number guess, odds-based payout curves).

## License

BSD-3-Clause-Clear. See `LICENSE`.
