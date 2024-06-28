require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const RegistrarControllar = require("./artifacts/RegistrarControllar.json");
const tldFactoryAbi = require("./artifacts/TldFactory.json");
const { root, generateProof } = require('./merkleProof');

const { GraphQLClient, gql } = require("graphql-request");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

const providerUrl = process.env.ALCHEMY_PROVIDER_API_URL;
const graphqlEndpoint = process.env.GRPAHQL_API_ENDPOINT;

const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const contract = new ethers.Contract(
  RegistrarControllar.address,
  RegistrarControllar.abi,
  provider
);

const tldFactory = new ethers.Contract(
  tldFactoryAbi.address,
  tldFactoryAbi.abi,
  provider
);

const query = gql`
  query MyQuery {
    tlds {
      tld
      identifier
    }
  }
`;

async function fetchTLDs() {
  const client = new GraphQLClient(graphqlEndpoint);
  try {
    const data = await client.request(query);
    return data.tlds;
  } catch (error) {
    console.error("Error fetching TLDs:", error);
    return [];
  }
}

app.get("/", async (req, res) => {
  res.json("welcome to MetaTLDs");
});

app.get("/check-availability/:name", async (req, res) => {
  try {
    const { name } = req.params;

    const tlds = await fetchTLDs();

    const results = await Promise.all(
      tlds.map(async ({ tld, identifier }) => {
        const available = await contract.available(identifier, name);
        let price = "Not Available";

        if (available) {
          const duration = 31536000;

          const priceData = await contract.rentPrice(
            identifier,
            name,
            duration
          );
          if (priceData.length === 2) {
            const totalPrice = ethers.BigNumber.from(priceData[0]).add(
              ethers.BigNumber.from(priceData[1])
            );
            price = ethers.utils.formatUnits(totalPrice, "wei");
          } else {
            throw new Error("Unexpected priceData structure");
          }
        }

        return {
          tld,
          identifier,
          name: `${name}.${tld}`,
          available,
          price,
        };
      })
    );

    res.json(results);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: error.message });
  }
});

// app.get("/check-available-tld/:name", async (req, res) => {
//   try {
//     const { name } = req.params;

//     // Convert name to bytes32
//     const nameBytes32 = ethers.utils.formatBytes32String(name);

//     // Generate Merkle proof (ensure it returns an array of bytes32)
//     const merkleProof = generateProof(name);

//     // Ensure merkleProof is an array of bytes32
//     const formattedProof = merkleProof.map(proof => ethers.utils.arrayify(proof));

//     const getAvailability = await tldFactory.checkAvailability(nameBytes32, formattedProof);

//     if (getAvailability) {
//       res.json(await getAvailability.wait());
//     } else {
//       console.log("TLD is not available...");
//       res.json({ available: false });
//     }
//   } catch (error) {
//     console.error("Error processing request:", error);
//     res.status(500).json({ error: error.message });
//   }
// });


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
