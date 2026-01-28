/**
 * List existing markets from MarketFactory
 *
 * Usage: npx tsx scripts/listMarkets.ts
 */

import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const marketFactoryAbi = [
  {
    name: 'marketIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'getMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'marketId', type: 'bytes32' },
          { name: 'question', type: 'string' },
          { name: 'outcomes', type: 'string[]' },
          { name: 'resolutionTime', type: 'uint256' },
          { name: 'winningOutcome', type: 'uint8' },
          { name: 'resolved', type: 'bool' },
          { name: 'creator', type: 'address' },
        ],
      },
    ],
  },
  {
    name: 'getMarketCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function main() {
  const rpcUrl = process.env['RPC_URL'] || 'https://sepolia-rollup.arbitrum.io/rpc';
  const marketFactoryAddress = process.env['MARKET_FACTORY_ADDRESS'] || '0x2a5C3684a8dEe90D04F89212cb419b9742470d9B';

  const client = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  console.log('=== Markets ===\n');
  console.log('MarketFactory:', marketFactoryAddress);

  try {
    // Get market count
    const count = await client.readContract({
      address: marketFactoryAddress as `0x${string}`,
      abi: marketFactoryAbi,
      functionName: 'getMarketCount',
    });

    console.log('Total markets:', count.toString());

    if (count === 0n) {
      console.log('\nNo markets found. Create one first!');
      return;
    }

    // List all markets
    for (let i = 0n; i < count; i++) {
      const marketId = await client.readContract({
        address: marketFactoryAddress as `0x${string}`,
        abi: marketFactoryAbi,
        functionName: 'marketIds',
        args: [i],
      });

      const market = await client.readContract({
        address: marketFactoryAddress as `0x${string}`,
        abi: marketFactoryAbi,
        functionName: 'getMarket',
        args: [marketId],
      });

      console.log(`\n--- Market ${i} ---`);
      console.log('ID:', marketId);
      console.log('Question:', market.question);
      console.log('Outcomes:', market.outcomes);
      console.log('Resolution Time:', new Date(Number(market.resolutionTime) * 1000).toISOString());
      console.log('Resolved:', market.resolved);
      console.log('Creator:', market.creator);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
