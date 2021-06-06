import { Button, Col, Row } from "antd";
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "../../components/ConnectButton";
import { TokenIcon } from "../../components/TokenIcon";
import { useConnectionConfig, sendTransaction, useConnection } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { useUserBalance, useUserTotalBalance } from "../../hooks";
import { WRAPPED_SOL_MINT } from "../../utils/ids";
import { formatUSD } from "../../utils/utils";
import { useWallet, WalletAdapter } from "../../contexts/wallet";
import { Account, Connection, Transaction, TransactionInstruction, TransactionCtorFields, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { createUninitializedMint, createTokenAccount } from "../../actions/account"
import Unity, { UnityContext } from "react-unity-webgl";
import { AccountLayout, MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram, TransferParams} from "@solana/web3.js";
import Cookies from 'universal-cookie';


export function home_notify(isWC: boolean) {
  console.log('home connected');
  var data = { isConnected: isWC, someInt: 36 };
  unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
}



const unityContext = new UnityContext({
  loaderUrl: "unity_build/serbuild.loader.js",
  dataUrl: "unity_build/serbuild.data",
  frameworkUrl: "unity_build/serbuild.framework.js",
  codeUrl: "unity_build/serbuild.wasm",
});

export const HomeView = () => {
  const addCardToCookie = function(clientMetadata: Buffer, mintAccountKey: string) {
    console.log(clientMetadata);
    var picture = clientMetadata.readUInt32LE(0);
    var nameLength = clientMetadata.readUInt32LE(4);
    var descriptionLength = clientMetadata.readUInt32LE(4 + nameLength);
    var name = clientMetadata.toString('utf8', 8, 8 + nameLength);
    var description = clientMetadata.toString('utf8', 12 + nameLength, 12 + nameLength + descriptionLength);
    const cookies = new Cookies();
    var cardsAmountCookie = cookies.get('cardsAmount');
    var cardsAmount = parseInt(cardsAmountCookie);
    cardsAmount = cardsAmount || 0;
    cookies.set('cards[' + cardsAmount + '][key]', mintAccountKey, { path: '/' });
    cookies.set('cards[' + cardsAmount + '][name]', name, { path: '/' });
    cookies.set('cards[' + cardsAmount + '][description]', description, { path: '/' });
    cookies.set('cards[' + cardsAmount + '][picture]', picture, { path: '/' });
    cardsAmount += 1;
    cookies.set('cardsAmount', cardsAmount, { path: '/' });
    updateCards();
  }

  const updateCards = function () {
    var cardsArray = [];
    const cookies = new Cookies();
    var cardsAmountCookie = cookies.get('cardsAmount');
    var cardsAmount = parseInt(cardsAmountCookie);
    cardsAmount = cardsAmount || 0;
    for (let i = 0; i < cardsAmount; i++) 
    {
      var cardData = {
        MintAdress: cookies.get('cards[' + i + '][key]'),
        Metadata: {
          Picture: parseInt(cookies.get('cards[' + i + '][picture]')),
          Name: cookies.get('cards[' + i + '][name]'),
          Description: cookies.get('cards[' + i + '][description]'),
        }
      }
      cardsArray.push({
        MintAdress: cookies.get('cards[' + i + '][key]'),
        Metadata: {
          Picture: parseInt(cookies.get('cards[' + i + '][picture]')),
          Name: cookies.get('cards[' + i + '][name]'),
          Description: cookies.get('cards[' + i + '][description]'),
        }
      });
    }
    console.log(JSON.stringify({
      Cards: cardsArray
    }))
  }

  const deserializeCard = function (joinedBuffer: string) {

  }

  const joinedBufferToBuffer = function(joinedBuffer: string) {
    var strBytesArray = joinedBuffer.split('|');
    var buf = Buffer.allocUnsafe(strBytesArray.length + 1);
    buf.writeInt8(0);
    for (var i = 0; i < strBytesArray.length; i++) {
      buf.writeInt8(parseInt(strBytesArray[i]), i+1);
    }
    return buf
  }



  var connection = useConnection();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const { tokenMap } = useConnectionConfig();
  const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  const SRM = useUserBalance(SRM_ADDRESS);
  const SOL = useUserBalance(WRAPPED_SOL_MINT);
  const { balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();
  const { wallet, connected, connect, select, provider } = useWallet();

  var connection = useConnection();

  var programId = new PublicKey("5Ds6QvdZAqwVozdu2i6qzjXm8tmBttV6uHNg4YU8rB1P");

  unityContext.on("LogToConsole", (message) => {
    console.log(typeof(message));
  });

  unityContext.on("CreateCard", async (card) => {
    var accounts: Account[];
    accounts = [];
    var buf = joinedBufferToBuffer(card);

    console.log('create card')

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      console.log('sending transaction')
      if (wallet?.publicKey) {
          
        let instructions: TransactionInstruction[] = [];
        var mintAccountPublicKey = createUninitializedMint(
          instructions,
          wallet.publicKey,
          await connection.getMinimumBalanceForRentExemption(MintLayout.span, 'singleGossip'),
          accounts
        );

        var createMintIx = Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          0,
          wallet.publicKey,
          wallet.publicKey,
        );
        instructions.push(createMintIx);

        let tokenAccountPublicKey = createTokenAccount(
          instructions, 
          wallet.publicKey, 
          await connection.getMinimumBalanceForRentExemption(AccountLayout.span, 'singleGossip'),
          mintAccountPublicKey,
          wallet.publicKey,
          accounts
        );

        var mintIx = Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          tokenAccountPublicKey,
          wallet.publicKey,
          [],
          1,
        );
        instructions.push(mintIx);

        var setMintAuthorityIx = Token.createSetAuthorityInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          null,
          'MintTokens',
          wallet.publicKey,
          [],
        );
        instructions.push(setMintAuthorityIx);  

        const cardMetadataAccountPublicKey = await PublicKey.createWithSeed(
          mintAccountPublicKey, //card key
          'CREATE CARD',
          programId,
        );
        var createCardMetadataIx = SystemProgram.createAccountWithSeed({
          fromPubkey: wallet.publicKey,
          basePubkey: mintAccountPublicKey,
          seed: 'CREATE CARD',
          newAccountPubkey: cardMetadataAccountPublicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(buf.length, 'singleGossip'),
          space: buf.length,
          programId: programId,
        });
        instructions.push(createCardMetadataIx); // Mb we want this one to be in rust code?    

        console.log('Sending buffer', buf);
        const saveMetadataIx = new TransactionInstruction({
          keys: [
            {pubkey: cardMetadataAccountPublicKey, isSigner: false, isWritable: true},
            {pubkey: mintAccountPublicKey, isSigner: false, isWritable: false},
            {pubkey: wallet.publicKey, isSigner: true, isWritable: false}
               ],
          programId,
          data: buf,
        });
        instructions.push(saveMetadataIx);

        sendTransaction(connection, wallet, instructions, accounts);

        let cardClientMetadataSize = buf.readUInt32LE(1);
        addCardToCookie(buf.slice(5, cardClientMetadataSize + 5), mintAccountPublicKey.toBase58());
        
      }
    }

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

    <Unity style={{ width: '100%', height: '100%' }} unityContext={unityContext} />
  );
};
