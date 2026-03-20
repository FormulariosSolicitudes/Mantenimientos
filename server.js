const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// 🔥 IMPORTANTE PARA RENDER (SESIONES)
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: "secreto",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // 🔥 obligatorio en Render (https)
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

        return done(null, {
            profile,
            accessToken,
            refreshToken // 🔥 CLAVE
        });
    }));

app.get("/auth/google",
    passport.authenticate("google", {
        scope: [
            "profile",
            "email",
            "https://www.googleapis.com/auth/gmail.send"
        ],
        accessType: "offline", // 🔥 NECESARIO
        prompt: "consent"      // 🔥 NECESARIO
    })
);

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/" }),
    (req, res) => res.redirect("/")
);

// 📩 ENVÍO DE CORREO
app.post("/send", async (req, res) => {

    console.log("📩 Datos recibidos:", req.body);

    if (!req.user) {
        return res.status(401).send("Debes iniciar sesión con Google");
    }

    const data = req.body;

    try {

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: req.user.profile.emails[0].value,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: req.user.refreshToken
            }
        });

        const mailOptions = {
            from: req.user.profile.emails[0].value,
            to: "formulariossolicitudes@gmail.com",
            replyTo: data.correo, // 🔥 clave para responder al asesor
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

        await transporter.sendMail(mailOptions);

        res.send("Correo enviado correctamente ✅");

    } catch (error) {
        console.error("❌ ERROR REAL:", error);
        res.status(500).send("Error al enviar correo");
    }
});

// 🔥 PUERTO PARA RENDER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});