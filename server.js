const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

// 🔥 IMPORTANTE PARA RENDER
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: "secreto",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        sameSite: "none"
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 🔐 GOOGLE LOGIN
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://mantenimientos-jzmo.onrender.com/auth/google/callback"
},
    (accessToken, refreshToken, profile, done) => {

        console.log("👤 Usuario logueado:", profile.emails[0].value);
        console.log("🔑 refreshToken:", refreshToken);

        return done(null, {
            profile,
            refreshToken: refreshToken || null
        });
    }));

// 🔍 Verificar sesión
app.get("/me", (req, res) => {
    if (req.user) {
        res.json({
            logged: true,
            email: req.user.profile.emails[0].value
        });
    } else {
        res.json({ logged: false });
    }
});

// ✅ LOGIN (FORZAR CONSENTIMIENTO SOLO LA PRIMERA VEZ)
app.get("/auth/google",
    passport.authenticate("google", {
        scope: [
            "profile",
            "email",
            "https://www.googleapis.com/auth/gmail.send"
        ],
        accessType: "offline",
        prompt: "consent" // 🔥 CLAVE PARA OBTENER REFRESH TOKEN
    })
);

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/" }),
    (req, res) => {
        // Guardar refreshToken en sesión si existe
        if (req.user && req.user.refreshToken) {
            req.session.refreshToken = req.user.refreshToken;
        }

        res.redirect("/");
    }
);

// 📩 ENVÍO DE CORREO CON GMAIL API
app.post("/send", async (req, res) => {

    if (!req.user) {
        return res.status(401).send("Debes iniciar sesión con Google");
    }

    const refreshToken = req.session.refreshToken;

    if (!refreshToken) {
        return res.status(401).send("No hay refresh token. Vuelve a iniciar sesión con Google.");
    }

    const data = req.body;

    try {
        const oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            "https://mantenimientos-jzmo.onrender.com/auth/google/callback"
        );

        oAuth2Client.setCredentials({
            refresh_token: refreshToken
        });

        const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

        const mensaje = [
            `From: ${req.user.profile.emails[0].value}`,
            `To: mantenimiento@record.com.co`,
            `Subject: Mantenimiento`,
            `Content-Type: text/plain; charset="UTF-8"`,
            ``,
            `Cédula: ${data.cedula}`,
            `Nombre: ${data.nombre}`,
            `Correo: ${data.correo}`,
            `Celular: ${data.celular}`,
            `Código PV: ${data.codigo_pv}`,
            `Nombre PV: ${data.nombre_pv}`,
            `Locativo: ${data.locativo_opciones || "N/A"}`,
            `Mobiliario: ${data.mobiliario_opciones || "."}`,
            `Descripción del caso: ${data.descripcion}`
        ].join("\n");

        const encodedMessage = Buffer.from(mensaje)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        // ✅ esperar respuesta real de Gmail
        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage
            }
        });

        console.log("📩 CORREO ENVIADO CORRECTAMENTE");

        return res.send("Solicitud enviada correctamente ✅");

    } catch (error) {
        console.error("❌ ERROR:", error);
        return res.status(500).send("Error al enviar correo");
    }
});

// 🔥 PUERTO PARA RENDER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});