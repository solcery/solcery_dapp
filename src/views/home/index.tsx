import { Button, Col, Row } from "antd";
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "../../components/ConnectButton";
import { TokenIcon } from "../../components/TokenIcon";
import { useConnectionConfig } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { useUserBalance, useUserTotalBalance } from "../../hooks";
import { WRAPPED_SOL_MINT } from "../../utils/ids";
import { formatUSD } from "../../utils/utils";

import Unity, { UnityContext } from "react-unity-webgl";
// import {View} from "react-native";

export const HomeView = () => {
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const { tokenMap } = useConnectionConfig();
  const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  const SRM = useUserBalance(SRM_ADDRESS);
  const SOL = useUserBalance(WRAPPED_SOL_MINT);
  const { balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();

  const unityContext = new UnityContext({
    loaderUrl: "unity_build/2_test_no_compression.loader.js",
    dataUrl: "unity_build/2_test_no_compression.data",
    frameworkUrl: "unity_build/2_test_no_compression.framework.js",
    codeUrl: "unity_build/2_test_no_compression.wasm",
  });

  useEffect(() => {
    const refreshTotal = () => { };

    const dispose = marketEmitter.onMarket(() => {
      refreshTotal();
    });

    refreshTotal();

    return () => {
      dispose();
    };
  }, [marketEmitter, midPriceInUSD, tokenMap]);

  return (
    // <Row gutter={[16, 16]} align="middle">
    //   <Col span={24}>
    //     <h2>Your balances ({formatUSD.format(totalBalanceInUSD)}):</h2>
    //     <h2>SOL: {SOL.balance} ({formatUSD.format(SOL.balanceInUSD)})</h2>
    //     <h2 style={{ display: 'inline-flex', alignItems: 'center' }}>
    //       <TokenIcon mintAddress={SRM_ADDRESS} /> SRM: {SRM?.balance} ({formatUSD.format(SRM?.balanceInUSD)})
    //     </h2>
    //   </Col>

    //   <Col span={12}>
    //     <ConnectButton />
    //   </Col>
    //   <Col span={12}>
    //     <Link to="/faucet">
    //       <Button>Faucet</Button>
    //     </Link>
    //   </Col>
    //   <Col span={24}>
    //     <div className="builton" />
    //   </Col>
    // </Row>

    // <View style = {{width: '100', height: '100%'}}>
        <Unity style = {{width: '100%', height: '100%'}} unityContext={unityContext} />
    // </View>
  );
};
