// CRX3 format: https://source.chromium.org/chromium/chromium/src/+/main:components/crx_file/crx3.proto
import { createHash, createPublicKey, sign } from "node:crypto";

const MAGIC = Buffer.from("Cr24");
const FORMAT_VERSION = 3;
const SIGNATURE_CONTEXT = Buffer.from("CRX3 SignedData\x00");
const CRX_ID_LENGTH = 16;

const FIELD_SHA256_WITH_RSA = 2;
const FIELD_SIGNED_HEADER_DATA = 10000;
const FIELD_PUBLIC_KEY = 1;
const FIELD_SIGNATURE = 2;
const FIELD_CRX_ID = 1;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

const varint = (value) => {
  const bytes = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
};

const bytesField = (fieldNumber, value) =>
  Buffer.concat([
    varint((fieldNumber << 3) | WIRE_TYPE_LENGTH_DELIMITED),
    varint(value.length),
    value,
  ]);

const uint32le = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

export const createCrx3 = (archive, privateKey) => {
  if (privateKey.asymmetricKeyType !== "rsa") {
    throw new Error(
      `Signing key must be RSA, got ${String(privateKey.asymmetricKeyType)}`,
    );
  }
  const publicKey = createPublicKey(privateKey).export({
    type: "spki",
    format: "der",
  });
  const crxId = createHash("sha256")
    .update(publicKey)
    .digest()
    .subarray(0, CRX_ID_LENGTH);
  const signedHeaderData = bytesField(FIELD_CRX_ID, crxId);
  const signature = sign(
    "sha256",
    Buffer.concat([
      SIGNATURE_CONTEXT,
      uint32le(signedHeaderData.length),
      signedHeaderData,
      archive,
    ]),
    privateKey,
  );
  const header = Buffer.concat([
    bytesField(
      FIELD_SHA256_WITH_RSA,
      Buffer.concat([
        bytesField(FIELD_PUBLIC_KEY, publicKey),
        bytesField(FIELD_SIGNATURE, signature),
      ]),
    ),
    bytesField(FIELD_SIGNED_HEADER_DATA, signedHeaderData),
  ]);
  return Buffer.concat([
    MAGIC,
    uint32le(FORMAT_VERSION),
    uint32le(header.length),
    header,
    archive,
  ]);
};
