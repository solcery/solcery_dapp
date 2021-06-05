import { Button, Dropdown, Menu } from "antd";
import { ButtonProps } from "antd/lib/button";
import { createUninitializedMint, createTokenAccount } from "../../actions/account"
import { AccountLayout, MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type AuthorityType from "@solana/spl-token";
import React, { useCallback } from "react";
import { LABELS } from "../../constants";
import { useWallet, WalletAdapter } from "../../contexts/wallet";
import { sendTransaction, useConnection } from "../../contexts/connection";
import { Account, Connection, Transaction, TransactionInstruction, TransactionCtorFields, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
// import { transfer } from "@project-serum/serum/lib/token-instructions";
import { SystemProgram, TransferParams} from "@solana/web3.js";
import { publicKey } from "../../utils/layout";
import { Row } from "antd";
import { notify } from "../../utils/notifications";

export interface ConnectButtonProps
  extends ButtonProps,
  React.RefAttributes<HTMLElement> {
  allowWalletChange?: boolean;
}

class Unit {
  id = 0;
  hp = 0;
  constructor(fields: {id: number, hp: number} | undefined = undefined) {
    if (fields) {
      this.id = fields.id;
      this.hp = fields.hp;
    }
  }
}

class Fight {
  unit1 = new Unit();
  unit2 = new Unit();
  constructor(fields: { unit1: Unit, unit2: Unit} | undefined = undefined) {
    if (fields) {
      this.unit1 = fields.unit1;
      this.unit2 = fields.unit2;
    }
  }
}

let fightInfo: string;
let fight: Fight;
let fightAccount: Account;
fightInfo = "no fight yet";

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

//const PROGRAM_PATH = path.resolve(__dirname, '../../../../nftmech/projects/mech/dist/program');

export const ConnectButton = (props: ConnectButtonProps) => {
  const { wallet, connected, connect, select, provider } = useWallet();
  const { onClick, children, disabled, allowWalletChange, ...rest } = props;

  var connection = useConnection();

  var programId = new PublicKey("5Ds6QvdZAqwVozdu2i6qzjXm8tmBttV6uHNg4YU8rB1P");

  var accounts: Account[];
  accounts = []

  const airdrop = useCallback(() => {

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        connection.requestAirdrop(wallet?.publicKey, 2000000000).then(() => {
          notify({
            message: LABELS.ACCOUNT_FUNDED,
            type: "success",
          });
        });
      }
    }

  }, [publicKey, connection]);

  const send = () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      console.log('sending transaction')
      if (wallet?.publicKey) {
        var transaction_instruction = SystemProgram.transfer({
          fromPubkey: wallet?.publicKey,
          toPubkey: new PublicKey('8YEPH1SR5kEbCKjEx9kQRa8LZimZ2NxPXeYv7hXETM5U'),
          lamports: 100000000,
        });

        let instructions: TransactionInstruction[] = [];
        sendTransaction(connection, wallet, instructions, accounts).then(() => {
          notify({
            message: LABELS.ACCOUNT_FUNDED,
            type: "success",
          });
        });
      }
    }
  };

  const createFight = async () => {
    console.log('send')

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        fightAccount = new Account()
        
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
        sendTransaction(connection, wallet, instructions, accounts).then( async () => {
          var accInfo = await connection.getAccountInfo(fightAccount.publicKey);
          if (accInfo) {
            if (accInfo.data) {
              var buf = Buffer.from(accInfo.data)
              console.log(buf)
              var numberOfUnits = buf.readUInt32LE(0)
              let units = []
              var unit1Id = buf.readUInt32LE(4)
              var unit1Hp = buf.readUInt32LE(8)
              var unit1 = new Unit({id: unit1Id, hp: unit1Hp})
              var unit2Id = buf.readUInt32LE(12)
              var unit2Hp = buf.readUInt32LE(16)
              var unit2 = new Unit({id: unit1Id, hp: unit1Hp})
              fight = new Fight({ unit1: unit1, unit2: unit2})
              fightInfo = 'FIGHT: ' + 'Unit ' + unit1Id + ' HP: ' + unit1Hp +' | ' + 'Unit ' + unit2Id + ' HP: ' + unit2Hp;
              var container = document.getElementById("FightState");
              if (container) {
                container.innerHTML= fightInfo;                 
              }
            }
          }
        });
      }
    }
  };

  const cast = async () => {
    console.log('cast')

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var cardPubkey = new PublicKey("V68XFgnTTzUYPNhz9CPEKDUp9vmFQKeeL82AXLccxU7");
        
        var buf = Buffer.allocUnsafe(3);
        buf.writeInt8(2, 0); // instruction = cast
        buf.writeInt8(0, 1); // caster = 0
        buf.writeInt8(0, 2); // target = 0
        console.log('Sending buffer', buf);
        const castIx = new TransactionInstruction({
          keys: [
            {pubkey: wallet.publicKey, isSigner: true, isWritable: false},
            {pubkey: fightAccount.publicKey, isSigner: false, isWritable: true},
            {pubkey: cardPubkey, isSigner: false, isWritable: false},
          ],
          programId,
          data: buf,
        });
        var instructions = [ castIx ];
        sendTransaction(connection, wallet, instructions, accounts).then( async () => {
          var accInfo = await connection.getAccountInfo(fightAccount.publicKey);
          if (accInfo) {
            if (accInfo.data) {
              var buf = Buffer.from(accInfo.data)
              console.log(buf)
              var numberOfUnits = buf.readUInt32LE(0)
              let units = []
              var unit1Id = buf.readUInt32LE(4)
              var unit1Hp = buf.readUInt32LE(8)
              var unit1 = new Unit({id: unit1Id, hp: unit1Hp})
              var unit2Id = buf.readUInt32LE(12)
              var unit2Hp = buf.readUInt32LE(16)
              var unit2 = new Unit({id: unit1Id, hp: unit1Hp})
              fight = new Fight({ unit1: unit1, unit2: unit2})
              fightInfo = 'FIGHT: ' + 'Unit ' + unit1Id + ' HP: ' + unit1Hp +' | ' + 'Unit ' + unit2Id + ' HP: ' + unit2Hp;
              var container = document.getElementById("FightState");
              if (container) {
                container.innerHTML= fightInfo;                 
              }
              //var content = container.innerHTML;

            }
          }
        });
      }
    }
  };

  const createCard = async () => {
    console.log('create card')

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      console.log('sending transaction')
      if (wallet?.publicKey) {
        
        /*const mintAccount = new Account();
        accounts.push(mintAccount);
        const createMintAccountIx = SystemProgram.createAccount({
          programId: TOKEN_PROGRAM_ID,
          space: MintLayout.span,
          lamports: await connection.getMinimumBalanceForRentExemption(MintLayout.span, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintAccount.publicKey
        });
        */

        // static createInitMintInstruction(
        //   programId: PublicKey,
        //   mint: PublicKey,
        //   decimals: number,
        //   mintAuthority: PublicKey,
        //   freezeAuthority: PublicKey | null,
        // ): TransactionInstruction;
        создаем один аккаунт, туда бахаем все минты, которые есть

        Потом просто юзаем associatedTokenAccount
        
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

        // static createSetAuthorityInstruction(
        //   programId: PublicKey,
        //   account: PublicKey,
        //   newAuthority: PublicKey | null,
        //   authorityType: AuthorityType,
        //   authority: PublicKey,
        //   multiSigners: Array<Account>,
        // ): TransactionInstruction;

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
          lamports: await connection.getMinimumBalanceForRentExemption(24, 'singleGossip'),
          space: 21,
          programId: programId,
        });
        instructions.push(createCardMetadataIx); // Mb we want this one to be in rust code?    

        var buf = Buffer.allocUnsafe(22);
        buf.writeInt8(0, 0); // instruction = createCard
        buf.writeInt32LE(0, 1); // action
        buf.writeInt32LE(3, 5); // damage
        buf.writeInt32LE(0, 6); // first object
        buf.writeInt32LE(2, 10); // value
        buf.writeInt32LE(0, 14); // const
        buf.writeInt32LE(3, 18); // =3
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
        
      }
    }
  };
  // only show if wallet selected or user connected

  const menu = (
    <Menu>
      <Menu.Item key="3" onClick={select}>
        Change Wallet
      </Menu.Item>
    </Menu>
  );

  if (!provider || !allowWalletChange) {
    return (
      <Row>
        <div id = "FightState">
          { "No fight yet" }
        </div>
        <Button
          {...rest}
          onClick={connected ? send : send}
          //onClick={connected ? onClick : connect}
          disabled={connected && disabled}
        >
          {connected ? LABELS.SEND_LABEL : LABELS.CONNECT_LABEL}
        </Button>

        <Button
          {...rest}
          onClick={connected ? createCard : createCard}
          //onClick={connected ? onClick : connect}
          disabled={connected && disabled}
        >
          {LABELS.TRANSACTION_2_LABEL}
        </Button>

        <Button
          {...rest}
          onClick={connected ? createFight : createFight}
          //onClick={connected ? onClick : connect}
          disabled={connected && disabled}
        >
          {LABELS.CREATE_FIGHT}
        </Button>

        <Button
          {...rest}
          onClick={connected ? cast : cast}
          //onClick={connected ? onClick : connect}
          disabled={connected && disabled}
        >
          {LABELS.CAST_CARD}
        </Button>

        <Button
          {...rest}
          onClick={connected ? airdrop : airdrop}
          //onClick={connected ? onClick : connect}
          disabled={connected && disabled}
        >
          {LABELS.GIVE_SOL}
        </Button>
      </Row>
    );
  }

  return (
    <Dropdown.Button
      onClick={connected ? onClick : connect}
      disabled={connected && disabled}
      overlay={menu}
    >
      {LABELS.CONNECT_LABEL}
    </Dropdown.Button>
  );
};
