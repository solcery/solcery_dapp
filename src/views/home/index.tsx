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

const joinedBufferToBuffer = function(joinedBuffer: string) {
  var strBytesArray = joinedBuffer.split('|');
  var buf = Buffer.allocUnsafe(strBytesArray.length + 1);
  buf.writeInt8(0);
  for (var i = 0; i < strBytesArray.length; i++) {
    buf.writeInt8(parseInt(strBytesArray[i]), i+1);
  }
  return buf
}

const unityContext = new UnityContext({
  loaderUrl: "unity_build/3_innovations.loader.js",
  dataUrl: "unity_build/3_innovations.data",
  frameworkUrl: "unity_build/3_innovations.framework.js",
  codeUrl: "unity_build/3_innovations.wasm",
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
    updateCollection();
  }

  const updateCollection = function () {
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
    unityContext.send("ReactToUnity", "UpdateCollection", JSON.stringify({ Cards: cardsArray }));
  }

  const updateFight = async () => {
    var cookies = new Cookies();
    var fightAccountKey = cookies.get('fightAccountKey');
    if (fightAccountKey) {
      var accInfo = await connection.getAccountInfo(new PublicKey(fightAccountKey));
      if (accInfo) {
        if (accInfo.data) {
          var buf = Buffer.from(accInfo.data)
          console.log(buf)
          var numberOfUnits = buf.readUInt32LE(0)
          let units = []
          var unit1Hp = buf.readUInt32LE(8)
          var unit2Hp = buf.readUInt32LE(16)
          const cookies = new Cookies();
          unityContext.send("ReactToUnity", "UpdateFight", JSON.stringify({ HP1: unit1Hp, HP2: unit2Hp }));
        }
      }
    }
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
    console.log(message);
  });

  unityContext.on("OnUnityLoaded", () => {
    updateFight();
    updateCollection();
    var data = { isConnected: connected, someInt: 42 };
    unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
  });

  unityContext.on("CreateFight", async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var fightAccount = new Account()
        var accounts: Account[];
        accounts = []
        var createFightAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: 20,
          lamports: await connection.getMinimumBalanceForRentExemption(100, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: fightAccount.publicKey,
        });
        accounts.push(fightAccount);
        var instructions = [ createFightAccountIx ];

        var buf = Buffer.allocUnsafe(1);
        buf.writeInt8(1, 0); // instruction = createCard
        console.log('Sending buffer', buf);
        const createFightIx = new TransactionInstruction({
          keys: [
            {pubkey: wallet.publicKey, isSigner: true, isWritable: false},
            {pubkey: fightAccount.publicKey, isSigner: false, isWritable: true},
          ],
          programId,
          data: buf,
        });
        instructions.push(createFightIx);
        sendTransaction(connection, wallet, instructions, accounts).then(() => {
          var cookies = new Cookies();
          cookies.set('fightAccountKey', fightAccount.publicKey.toBase58());
          updateFight();
        });
      }
    }
  });

  unityContext.on("CreateCard", async (card) => {
    var accounts: Account[];
    accounts = [];
    var buf = joinedBufferToBuffer(card);
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
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
          'SOLCERYCARD',
          programId,
        );
        var createCardMetadataIx = SystemProgram.createAccountWithSeed({
          fromPubkey: wallet.publicKey,
          basePubkey: mintAccountPublicKey,
          seed: 'SOLCERYCARD',
          newAccountPubkey: cardMetadataAccountPublicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(buf.length, 'singleGossip'),
          space: buf.length - 1,
          programId: programId,
        });
        instructions.push(createCardMetadataIx); // Mb we want this one to be in rust code?    

        const saveMetadataIx = new TransactionInstruction({
          keys: [
            {pubkey: wallet.publicKey, isSigner: true, isWritable: false},
            {pubkey: cardMetadataAccountPublicKey, isSigner: false, isWritable: true},
            {pubkey: mintAccountPublicKey, isSigner: false, isWritable: false}
               ],
          programId,
          data: buf,
        });
        instructions.push(saveMetadataIx);

        await sendTransaction(connection, wallet, instructions, accounts).then( async () => {
          let cardClientMetadataSize = buf.readUInt32LE(1);
          addCardToCookie(buf.slice(5, cardClientMetadataSize + 5), cardMetadataAccountPublicKey.toBase58());
        });
      }
    }
  });

  unityContext.on("UseCard", (cardAccountKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        const cookies = new Cookies();
        var fightAccountStringKey = cookies.get('fightAccountKey');
        if (fightAccountStringKey) {
          var accounts: Account[];
          accounts = []
          var cardPubkey = new PublicKey(cardAccountKey);
          var fightAccountPubkey = new PublicKey(fightAccountStringKey);
          var buf = Buffer.allocUnsafe(3);
          buf.writeInt8(2, 0); // instruction = cast
          buf.writeInt8(0, 1); // caster = 0
          buf.writeInt8(0, 2); // target = 1
          console.log('Sending buffer', buf);
          const castIx = new TransactionInstruction({
            keys: [
              {pubkey: wallet.publicKey, isSigner: true, isWritable: false},
              {pubkey: fightAccountPubkey, isSigner: false, isWritable: true},
              {pubkey: cardPubkey, isSigner: false, isWritable: false},
            ],
            programId,
            data: buf,
          });
          var instructions = [ castIx ];
          sendTransaction(connection, wallet, instructions, accounts).then( async () => {
            updateFight();
          });
        }
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
