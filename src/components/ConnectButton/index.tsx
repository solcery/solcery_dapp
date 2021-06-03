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
    console.log('send')

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
        sendTransaction(connection, wallet, instructions, accounts);
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
          space: 20,
          programId: programId,
        });
        instructions.push(createCardMetadataIx); // Mb we want this one to be in rust code?    

        var buf = Buffer.allocUnsafe(21);
        buf.writeInt8(1, 0); // instruction = createCard
        buf.writeInt32LE(0, 1); // action
        buf.writeInt32LE(3, 5); // damage
        buf.writeInt32LE(2, 9); // value
        buf.writeInt32LE(0, 13); // const
        buf.writeInt32LE(3, 17); // =3
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
