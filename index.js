import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, GetObjectCommand,PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import express from "express";
import multer from "multer";
import fs from "fs";
import { data } from "./file.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
config();

const app = express();
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: "uploads/" });

const lambda_client = new LambdaClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const s3_client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

app.get("/", (req, res) => {
    res.render("index", { message: null, response: null });
});

app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.render("index", { message: "No file uploaded!", response: null });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const encodedFile = fileBuffer.toString("base64");

        const input = {
            FunctionName: process.env.AWS_LAMBDA_NAME,
            InvocationType: "RequestResponse",
            Payload: new TextEncoder().encode(JSON.stringify({ file: encodedFile })),
        };

        const command = new InvokeCommand(input);
        const response = await lambda_client.send(command);

        const decodedPayload = new TextDecoder().decode(response.Payload);

        res.render("index", {
            message: "Lambda Invoked Successfully",
            response: JSON.parse(decodedPayload)
        });

    } catch (error) {
        console.error("Error invoking Lambda:", error);
        res.render("index", {
            message: "Lambda invocation failed",
            response: { error: error.message }
        });
    }
});

app.post("/url", async (req, res) => {
    try {
        const filename = "7mb.json"
        const signedUrl = await getSignedUrl(s3_client, new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: filename,
            ContentType: "json"

        }));

        res.json({ uploadUrl: signedUrl, filename });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        res.status(500).json({ message: "Error generating signed URL" });
    }
});

app.post("/upload-v2", async (req, res) => {
    try {
        
        console.log("Received body:", req.body);
        if (!req.body.filename) {
            return res.status(400).json({ error: "fileName is missing" });
        }
        const fileName = req.body.filename;
        const signedUrl = await getSignedUrl(s3_client, new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            ContentType: "json"

        }));

        const input = {
            FunctionName: process.env.AWS_LAMBDA_NAME,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify(signedUrl)
        };

        const command = new InvokeCommand(input);
        const response = await lambda_client.send(command);

        const decodedPayload = new TextDecoder().decode(response.Payload);
        // const jsonResponse = JSON.parse(decodedPayload);

        console.log(decodedPayload)
        res.send(decodedPayload);

    } catch (error) {
        console.error("Error invoking Lambda:", error);
        res.render({
            message: "Lambda invocation failed",
            response: { error: error.message }
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));