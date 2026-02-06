export const ADDRESSES = {
  MarketFactory: "0x3555b28e59e32b6d0d81de5ff123cbe73d518592",
  OrderQueue: "0x67b830886a47bbb5f2019eb129e81f217ec56f09",
  PrivateToken: "0x7402c579e7a661b3fda0553e511d14bf0aadcab9",
  StateAnchor: "0x074af457ea1c58752705ce157f6892e5bbfc5988",
  MockUSDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  CallbackReceiver: "0xBD830E10aD1A1cb6054da7A3B52BAFb93Bd0f4c1",
  PredictionMarket: process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS || "",
} as const;
