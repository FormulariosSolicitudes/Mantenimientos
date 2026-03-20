const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: "secreto",
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 🔐 GOOGLE LOGIN
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
    (accessToken, refreshToken, profile, done) => {
        return done(null, { profile, accessToken });
    }));

app.get("/auth/google",
    passport.authenticate("google", {
        scope: ["profile", "email", "https://www.googleapis.com/auth/gmail.send"],
        prompt: "select_account"
    })
);

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/" }),
    (req, res) => res.redirect("/")
);

// 📩 ENVÍO DE CORREO
app.post("/send", async (req, res) => {
    if (!req.user) {
        return res.status(401).send("Debes iniciar sesión");
    }

    const data = req.body;

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            type: "OAuth2",
            user: req.user.profile.emails[0].value,
            accessToken: req.user.accessToken
        }
    });

    const mailOptions = {
        from: req.user.profile.emails[0].value,
        to: "formulariossolicitudes@gmail.com",
        subject: "Nueva solicitud",
        text: `
        📌 DATOS PERSONALES
        Cédula: ${data.cedula}
        Nombre: ${data.nombre}
        Correo: ${data.correo}
        Celular: ${data.celular}

        📍 PUNTO DE VENTA
        Código: ${data.codigo_pv}
        Nombre PV: ${data.nombre_pv}

        🛠 TIPO
        Locativo: ${data.locativo ? "Sí" : "No"}
        Mobiliario: ${data.mobiliario ? "Sí" : "No"}

        🔧 DETALLES
        Locativo: ${data.locativo_opciones}
        Mobiliario: ${data.mobiliario_opciones}

        📝 DESCRIPCIÓN
        ${data.descripcion}
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.send("Correo enviado correctamente");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al enviar correo");
    }
});

app.listen(3000, () => {
    console.log("http://localhost:3000");
});