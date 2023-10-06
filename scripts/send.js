const web3 = require("@solana/web3.js");

const BufferLayout = require("@solana/buffer-layout");
const { Buffer } = require("buffer");

const rustString = function rustString(property) {
    const rsl = BufferLayout.struct([
        BufferLayout.u32('length'),
        BufferLayout.u32('lengthPadding'),
        BufferLayout.blob(BufferLayout.offset(BufferLayout.u32(), -8), 'chars')
    ], property);
    const _decode = rsl.decode.bind(rsl);
    const _encode = rsl.encode.bind(rsl);
    const rslShim = rsl;
    rslShim.decode = function (b, offset) {
        const data = _decode(b, offset);
        return data['chars'].toString();
    };
    rslShim.encode = function (str, b, offset) {
        const data = {
            chars: Buffer.from(str, 'utf8')
        };
        return _encode(data, b, offset);
    };
    rslShim.alloc = function (str) {
        return BufferLayout.u32().span + BufferLayout.u32().span + Buffer.from(str, 'utf8').length;
    };
    return rslShim;
};

function getAlloc(type, fields) {
    const getItemAlloc = function getItemAlloc(item) {
        if (item.span >= 0) {
            return item.span;
        } else if (typeof item.alloc === 'function') {
            return item.alloc(fields[item.property]);
        } else if ('count' in item && 'elementLayout' in item) {
            var field = fields[item.property];
            if (Array.isArray(field)) {
                return field.length * getItemAlloc(item.elementLayout);
            }
        } else if ('fields' in item) {
            // This is a `Structure` whose size needs to be recursively measured.
            return getAlloc({
                layout: item
            }, fields[item.property]);
        }
        // Couldn't determine allocated size of layout
        return 0;
    };
    let alloc = 0;
    type.layout.fields.forEach(function (item) {
        alloc += getItemAlloc(item);
    });
    return alloc;
}

const WS_ENDPOINT = "ws://localhost:8900";
const HTTP_ENDPOINT = "http://localhost:8899";
const connection = new web3.Connection(HTTP_ENDPOINT,{ wsEndpoint: WS_ENDPOINT });

const secretKey = Uint8Array.from([
    202, 171, 192, 129, 150, 189, 204, 241, 142, 71, 205, 2, 81, 97, 2, 176, 48,
    81, 45, 1, 96, 138, 220, 132, 231, 131, 120, 77, 66, 40, 97, 172, 91, 245, 84,
    221, 157, 190, 9, 145, 176, 130, 25, 43, 72, 107, 190, 229, 75, 88, 191, 136,
    7, 167, 109, 91, 170, 164, 186, 15, 142, 36, 12, 23,
]);
const signer = web3.Keypair.fromSecretKey(secretKey);

console.log(signer.publicKey.toBase58());

const programId = new web3.PublicKey("9TgeQ1HLSvHF47qYVoh2PMfpLEc2NVe1HEE6tp8b2bSg");
const promptStruct = {
    index: 1,
    layout: BufferLayout.struct([
        BufferLayout.u32('instruction'),
        rustString("input"),
    ])
};

console.log(promptStruct.layout.span)

const params = {
    input: "Hello"
};
const data = Buffer.alloc(promptStruct.layout.span > 0 ? promptStruct.layout.span : getAlloc(promptStruct, params) );
promptStruct.layout.encode({
    instruction: 1,
    input: "Hello"
}, data);

console.log(data)

//const data = Buffer.from(stringToU8a("Hello"));

let transaction = new web3.Transaction({
    feePayer: signer.publicKey,
});
let keys = [{ pubkey: signer.publicKey, isSigner: true, isWritable: true }];
transaction.add(
    new web3.TransactionInstruction({
        keys,
        programId,
        data,
    }),
);

(async () => {
    console.log("Sending")
    await web3.sendAndConfirmTransaction(connection, transaction, [
        signer,
        signer,
    ]);
    console.log("Complete")
})().catch(console.error).finally(() => process.exit());
