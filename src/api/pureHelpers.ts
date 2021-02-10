import {
  ABIDynamicRelay,
  RawABIDynamicRelay,
  StaticRelay
} from "@/store/modules/swap/ethBancor";
import {
  ConverterAndAnchor,
  ViewGroupedPositions,
  ViewProtectedLiquidity
} from "@/types/bancor";
import BigNumber from "bignumber.js";
import { partition } from "lodash";
import { compareString } from "@/api/helpers";
import sort from "fast-sort";
import numeral from "numeral";

const oneMillion = new BigNumber(1000000);

export const calculateAmountToGetSpace = (
  bntAmount: string,
  tknAmount: string,
  bntSpaceAvailable: string,
  limit: string
): string => {
  const bntAmountDecimal = new BigNumber(bntAmount);
  const tknAmountDecimal = new BigNumber(tknAmount);
  const bntSpaceAvailableAmount = new BigNumber(bntSpaceAvailable);
  const limitAmount = new BigNumber(limit);
  return bntAmountDecimal
    .div(tknAmountDecimal)
    .plus(bntSpaceAvailableAmount)
    .minus(limitAmount)
    .toString();
};

export const groupPositionsArray = (
  arr: ViewProtectedLiquidity[]
): ViewGroupedPositions[] => {
  console.log(
    arr[0].pendingReserveReward,
    typeof arr[0].pendingReserveReward == "string",
    "just kidding"
  );
  return arr.reduce(
    (obj => (acc: ViewGroupedPositions[], val: ViewProtectedLiquidity) => {
      const symbol = val.stake.symbol;
      const poolId = val.stake.poolId;
      const id = `${poolId}-${symbol}`;
      const filtered = arr.filter(
        x => x.stake.poolId === poolId && x.stake.symbol === symbol
      );
      let item: ViewGroupedPositions = obj.get(id);
      if (!item) {
        //@ts-ignore
        item = new Object({});
        item.collapsedData = [];
        item.id = id;
        item.positionId = val.id;
        item.poolId = poolId;
        item.symbol = symbol;
        item.apr = val.apr;
        item.insuranceStart = val.insuranceStart;
        item.coverageDecPercent = val.coverageDecPercent;
        item.fullCoverage = val.fullCoverage;
        item.pendingReserveReward = val.pendingReserveReward;
        console.log(arr, "is the arr", item, item.pendingReserveReward);

        const sumStakeAmount = filtered
          .map(x => Number(x.stake.amount || 0))
          .reduce((sum, current) => sum + current);

        const sumFullyProtected = filtered
          .map(x => Number(x.fullyProtected ? x.fullyProtected.amount : 0))
          .reduce((sum, current) => sum + current);
        let sumFullyProtectedWithReward: BigNumber;

        const sumProtectedAmount = filtered
          .map(x => Number(x.protectedAmount ? x.protectedAmount.amount : 0))
          .reduce((sum, current) => sum + current);
        let sumProtectedWithReward: BigNumber;

        if (compareString(symbol, "BNT")) {
          sumFullyProtectedWithReward = item.pendingReserveReward.plus(
            sumFullyProtected
          );
          sumProtectedWithReward = item.pendingReserveReward.plus(
            sumProtectedAmount
          );
        } else {
          const bntRewardUsd = item.pendingReserveReward.times(
            val.bntTokenPrice
          );
          sumFullyProtectedWithReward = bntRewardUsd
            .div(val.reserveTokenPrice)
            .plus(sumFullyProtected);
          sumProtectedWithReward = bntRewardUsd
            .div(val.reserveTokenPrice)
            .plus(sumProtectedAmount);
        }

        const sumFullyProtectedWithRewardUSD =
          Number(sumFullyProtectedWithReward) * val.reserveTokenPrice;

        const sumProtectedWithRewardUSD =
          Number(sumProtectedWithReward) * val.reserveTokenPrice;

        const sumFees = filtered
          .map(x => Number(x.fees ? x.fees.amount : 0))
          .reduce((sum, current) => sum + current, 0);

        item.stake = {
          amount: sumStakeAmount,
          usdValue: sumStakeAmount * val.reserveTokenPrice,
          unixTime: val.stake.unixTime
        };
        item.fullyProtected = {
          amount: sumFullyProtectedWithReward.toNumber(),
          usdValue: sumFullyProtectedWithRewardUSD
        };
        item.protectedAmount = {
          amount: sumProtectedWithReward.toNumber(),
          usdValue: sumProtectedWithRewardUSD
        };
        item.roi =
          (Number(sumFullyProtectedWithReward) - sumStakeAmount) /
          sumStakeAmount;
        item.fees = sumFees;

        obj.set(id, item);
        acc.push(item);
      }
      if (item.insuranceStart > val.insuranceStart) {
        item.insuranceStart = val.insuranceStart;
        item.coverageDecPercent = val.coverageDecPercent;
        item.fullCoverage = val.fullCoverage;
        item.stake.unixTime = val.stake.unixTime;
      }
      if (filtered.length > 1) {
        item.collapsedData.push(val);
        item.collapsedData = sort(item.collapsedData).desc(
          (p: ViewProtectedLiquidity) => p.stake.unixTime
        );
      }
      return acc;
    })(new Map()),
    []
  );
};

export const decToPpm = (dec: number | string): string =>
  new BigNumber(dec).times(oneMillion).toFixed(0);

export const miningBntReward = (
  protectedBnt: string,
  rewardRate: string,
  rewardShare: number
) => {
  return new BigNumber(rewardRate)
    .multipliedBy(86400)
    .multipliedBy(2)
    .multipliedBy(rewardShare)
    .multipliedBy(365)
    .dividedBy(protectedBnt)
    .toNumber();
};

export const miningTknReward = (
  tknReserveBalance: string,
  bntReserveBalance: string,
  protectedTkn: string,
  rewardRate: string,
  rewardShare: number
) => {
  return new BigNumber(rewardRate)
    .multipliedBy(86400)
    .multipliedBy(2)
    .multipliedBy(rewardShare)
    .multipliedBy(new BigNumber(tknReserveBalance).dividedBy(bntReserveBalance))
    .multipliedBy(365)
    .dividedBy(protectedTkn)
    .toNumber();
};

export const compareStaticRelayAndSet = (
  staticRelay: StaticRelay,
  anchorAndConverter: ConverterAndAnchor
) =>
  compareString(
    staticRelay.poolToken.contract,
    anchorAndConverter.anchorAddress
  ) &&
  compareString(
    staticRelay.converterAddress,
    anchorAndConverter.converterAddress
  );

export const expandToken = (amount: string | number, precision: number) => {
  const trimmed = new BigNumber(amount).toFixed(precision, 1);
  const inWei = new BigNumber(trimmed)
    .times(new BigNumber(10).pow(precision))
    .toFixed(0);
  return inWei;
};

export const staticToConverterAndAnchor = (
  staticRelay: StaticRelay
): ConverterAndAnchor => ({
  converterAddress: staticRelay.converterAddress,
  anchorAddress: staticRelay.poolToken.contract
});

export const calculatePriceDeviationTooHigh = (
  averageRate: BigNumber,
  primaryReserveBalance: BigNumber,
  secondaryReserveBalance: BigNumber,
  averageRateMaxDeviation: BigNumber
): boolean => {
  const spotRate = primaryReserveBalance.dividedBy(secondaryReserveBalance);

  const averageRateMaxDeviationBase = new BigNumber(oneMillion).minus(
    averageRateMaxDeviation
  );

  const threshold = averageRate.dividedBy(spotRate);

  const withinLowerThreshold = threshold.isGreaterThan(
    averageRateMaxDeviationBase.dividedBy(oneMillion)
  );

  const withinHigherThreshold = oneMillion
    .dividedBy(averageRateMaxDeviationBase)
    .isGreaterThan(threshold);

  const priceDeviationTooHigh = !(
    withinLowerThreshold && withinHigherThreshold
  );

  return priceDeviationTooHigh;
};

export const reserveContractsInStatic = (relay: StaticRelay) =>
  relay.reserves.map(reserve => reserve.contract);

export const parseRawDynamic = (
  rawDynamicRelay: RawABIDynamicRelay
): ABIDynamicRelay => {
  const {
    reserveOneAddress,
    reserveOne,
    reserveTwoAddress,
    reserveTwo
  } = rawDynamicRelay;
  const reserves = [
    [reserveOneAddress, reserveOne],
    [reserveTwoAddress, reserveTwo]
  ].map(([reserveAddress, reserveBalance]) => ({
    reserveAddress,
    reserveBalance
  }));

  return {
    connectorTokenCount: rawDynamicRelay.connectorTokenCount,
    conversionFee: rawDynamicRelay.conversionFee,
    converterAddress: rawDynamicRelay.converterAddress,
    reserves
  };
};

export const filterAndWarn = <T>(
  arr: T[],
  conditioner: (item: T) => boolean,
  reason?: string
): T[] => {
  const [passed, dropped] = partition(arr, conditioner);
  if (dropped.length > 0) {
    console.warn(
      "Dropped",
      dropped,
      "items from array",
      reason ? `because ${reason}` : ""
    );
  }
  return passed;
};

export const prettifyNumber = (
  num: number | string | BigNumber,
  usd = false
): string => {
  const bigNum = new BigNumber(num);
  if (usd) {
    if (bigNum.lte(0)) return "$0.00";
    else if (bigNum.lt(0.01)) return "< $0.01";
    else if (bigNum.gt(100)) return numeral(bigNum).format("$0,0", Math.floor);
    else return numeral(bigNum).format("$0,0.00");
  } else {
    if (bigNum.lte(0)) return "0";
    else if (bigNum.gte(2))
      return numeral(bigNum).format("0,0.[00]", Math.floor);
    else if (bigNum.lt(0.000001)) return "< 0.000001";
    else return numeral(bigNum).format("0.[000000]", Math.floor);
  }
};

export const calculateLimits = (
  poolLimitWei: string,
  defaultLimitWei: string,
  mintedWei: string,
  tknReserveBalance: string,
  bntReserveBalance: string
) => {
  const limitOrDefault = new BigNumber(
    poolLimitWei !== "0" ? poolLimitWei : defaultLimitWei
  );
  const tknDelta = limitOrDefault.minus(mintedWei);
  const bntRate = new BigNumber(tknReserveBalance).dividedBy(
    new BigNumber(bntReserveBalance)
  );

  let tknLimitWei = bntRate.multipliedBy(tknDelta);

  // add some buffer to avoid tx fails
  tknLimitWei = tknLimitWei.multipliedBy(
    new BigNumber("99.9").dividedBy("100")
  );

  return { bntLimitWei: mintedWei, tknLimitWei };
};
