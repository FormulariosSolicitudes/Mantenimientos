const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const OIDCStrategy = require("passport-azure-ad").OIDCStrategy;
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.static("public"));

// 🔥 SESSION (ARREGLADO PARA RENDER)
app.use(session({
    secret: "secreto",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: true,
        sameSite: "none"
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/* =========================
   🔵 GOOGLE LOGIN
========================= */
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://mantenimientos-jzmo.onrender.com/auth/google/callback"
},
    (accessToken, refreshToken, profile, done) => {

        console.log("👤 Google:", profile.emails[0].value);

        return done(null, {
            provider: "google",
            email: profile.emails[0].value,
            refreshToken: refreshToken || null
        });
    }));

/* =========================
   🟦 OUTLOOK LOGIN
========================= */
passport.use(new OIDCStrategy({
    identityMetadata: "https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration",
    clientID: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    responseType: "code",
    responseMode: "query",
    redirectUrl: "https://mantenimientos-jzmo.onrender.com/auth/microsoft/callback",

    allowHttpForRedirectUrl: true, // 🔥 IMPORTANTE

    scope: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://graph.microsoft.com/Mail.Send"
    ],

    passReqToCallback: false
},
    (iss, sub, profile, accessToken, refreshToken, done) => {

        const email =
            profile._json?.email ||
            profile._json?.preferred_username;

        console.log("👤 Outlook:", email);

        return done(null, {
            provider: "microsoft",
            email,
            accessToken
        });
    }));

/* =========================
   🔐 LOGIN ROUTES
========================= */

// GOOGLE
app.get("/auth/google",
    passport.authenticate("google", {
        scope: [
            "profile",
            "email",
            "https://www.googleapis.com/auth/gmail.send"
        ],
        accessType: "offline",
        prompt: "consent"
    })
);

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/" }),
    (req, res) => {

        if (req.user.refreshToken) {
            req.session.refreshToken = req.user.refreshToken;
        }

        res.redirect("/");
    }
);

// OUTLOOK
app.get("/auth/microsoft",
    passport.authenticate("azuread-openidconnect")
);

app.get("/auth/microsoft/callback",
    passport.authenticate("azuread-openidconnect", {
        failureRedirect: "/"
    }),
    (req, res) => {
        res.redirect("/");
    }
);

/* =========================
   🔍 SESIÓN
========================= */
app.get("/me", (req, res) => {
    if (req.user) {
        res.json({
            logged: true,
            email: req.user.email,
            provider: req.user.provider
        });
    } else {
        res.json({ logged: false });
    }
});

/* =========================
   📩 ENVÍO CORREO
========================= */
app.post("/send", async (req, res) => {

    console.log("🔥 ENTRO A /send");

    if (!req.user) {
        return res.status(401).send("Debes iniciar sesión");
    }

    const data = req.body;

    try {

        // 🔵 GOOGLE
        if (req.user.provider === "google") {

            const oAuth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                "https://mantenimientos-jzmo.onrender.com/auth/google/callback"
            );

            oAuth2Client.setCredentials({
                refresh_token: req.session.refreshToken
            });

            const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

            const mensaje = [
                `From: ${req.user.email}`,
                `To: brayanmachado2015@gmail.com`,
                `Subject: Mantenimiento`,
                `Content-Type: text/plain; charset="UTF-8"`,
                ``,
                `Cédula: ${data.cedula}`,
                `Nombre: ${data.nombre}`,
                `Celular: ${data.celular}`,
                `Código PV: ${data.codigo_pv}`,
                `Nombre PV: ${data.nombre_pv}`,
                `Locativo: ${data.locativo_opciones || "N/A"}`,
                `Mobiliario: ${data.mobiliario_opciones || "N/A"}`,
                `Descripción: ${data.descripcion}`
            ].join("\n");

            const encodedMessage = Buffer.from(mensaje)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

            await gmail.users.messages.send({
                userId: "me",
                requestBody: { raw: encodedMessage }
            });

            console.log("📩 ENVIADO CON GMAIL");
            return res.send("Enviado con Gmail ✅");
        }

        // 🟢 OUTLOOK
        if (req.user.provider === "microsoft") {

            await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${req.user.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: {
                        subject: "Mantenimiento",
                        body: {
                            contentType: "Text",
                            content:
                                `Cédula: ${data.cedula}\n` +
                                `Nombre: ${data.nombre}\n` +
                                `Celular: ${data.celular}\n` +
                                `Código PV: ${data.codigo_pv}\n` +
                                `Nombre PV: ${data.nombre_pv}\n` +
                                `Locativo: ${data.locativo_opciones}\n` +
                                `Mobiliario: ${data.mobiliario_opciones}\n` +
                                `Descripción: ${data.descripcion}`
                        },
                        toRecipients: [
                            {
                                emailAddress: {
                                    address: "brayanmachado2015@gmail.com"
                                }
                            }
                        ]
                    }
                })
            });

            console.log("📩 ENVIADO CON OUTLOOK");
            return res.send("Enviado con Outlook ✅");
        }

    } catch (error) {
        console.error("❌ ERROR:", error);
        return res.status(500).send("Error al enviar correo");
    }
});

/* =========================
   🚀 SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});