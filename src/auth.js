import mongo from "mongodb";
import connect from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

(async () => {
  try {
    let db = await connect();
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    console.log("Index created successfully!");
  } catch (error) {
    console.log("Error creating index: ", error);
  }
})();

export default {
  async registerUser(userData) {
    let db = await connect();

    if (
      !userData.username ||
      !userData.password ||
      !userData.userType ||
      !userData.fullName
    ) {
      throw new Error(
        "Missing required fields: username, full name, password, and userType are required."
      );
    }

    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(userData.password, 10);
    } catch (error) {
      console.error("Error hashing password:", error);
      throw new Error("Server error during password hashing.");
    }

    let doc = {
      username: userData.username, // Add email to the schema
      fullName: userData.fullName, // Add fullname to the schema
      password: hashedPassword, // Add encrypted password to the schema
      userType: userData.userType, // Add usertype to the schema
      grad: userData.grad || "",
      role: userData.role || "user", // Default role
    };
    try {
      let result = await db.collection("users").insertOne(doc);
      if (result && result.insertedId) {
        return result.insertedId;
      }
      console.log(doc);
    } catch (error) {
      if (error.code == 11000) {
        console.error("Duplicate username:", error);
        throw new Error("Username already exists");
      }
      console.error("Error inserting user into database: AUTH.JS", error);
      throw new Error("Server error during user registration");
    }
  },

  async authenticateUser(username, password) {
    let db = await connect();
    let user = await db.collection("users").findOne({ username: username });

    if (!user) {
      throw new Error("User not found!");
    }

    if (
      user &&
      user.password &&
      (await bcrypt.compare(password, user.password))
    ) {
      delete user.password;
      let token = jwt.sign(
        {
          _id: user._id,
          username: user.username,
          fullName: user.fullName,
          userType: user.userType,
          grad: user.grad,
          role: user.role || "user",
        },
        process.env.JWT_SECRET,
        {
          algorithm: "HS512",
          expiresIn: "1 week",
        }
      );
      return {
        token,
        username: user.username,
        fullName: user.fullName,
        userType: user.userType,
        grad: user.grad,
        role: user.role || "user",
        _id: user._id,
      };
    } else {
      throw new Error("Invalid username or password");
    }
  },
  verify(req, res, next) {
    try {
      const authorization = req.headers.authorization;
      // Check if the Authorization header is present
      if (!authorization) {
        return res.status(401).json({ error: "Authorization header missing" });
      }

      // Split the Authorization header into "Bearer" and the token
      const [type, token] = authorization.split(" ");

      //let authorization = req.headers.authorization.split(' ');
      //let type = authorization[0];
      //let token = authorization[1];

      if (type !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid token type!" });
      }

      req.jwt = jwt.verify(token, process.env.JWT_SECRET);
      console.log("JWT Decoded successfully: ", req.jwt);

      if (!req.jwt || !req.jwt._id) {
        return res
          .status(403)
          .json({ error: "Invalid token or missing user ID" });
      }

      // Super admin check
      if (req.jwt.userType === "superadmin") {
        req.isSuperAdmin = true;
      } else {
        req.isSuperAdmin = false;
      }
      return next();
    } catch (error) {
      console.error("JWT verification failed: ", error);
      return res.status(401).send({ error: "Unauthorized" });
    }
  },
};
