const path = require("path");
const getPool = require("../db/db.js");
const fs = require("fs");
const { getNextUserId } = require("../utils/maxUserID.utils.js");

const getUsers = async (req, res, next) => {
  const pool = getPool();
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;
  try {
    const result = await pool.query("SELECT * FROM users_get_all($1,$2)", [
      limit,
      offset,
    ]);

    res.status(200).json({
      message: "Users fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("error in fetching users =", error);
    next(error);
  }
};

const createUsers = async (req, res, next) => {
  const pool = getPool();

  try {
    if (!req.body.userId) {
      req.body.userId = await getNextUserId();
    }

    // Extract files
    const agreementsFiles = req.files?.agreement || [];
    const documentsFiles = req.files?.document || [];

    // Convert files to JSON arrays - USE file.filename (not originalname)
    const agreements = agreementsFiles.map((file, index) => ({
      agreementDate: new Date().toISOString().split("T")[0],
      agreementSignDate: new Date().toISOString().split("T")[0],
      agreementStatusId: 1,
      approvalDate: null, // ✅ Don't set fake dates
      expiryDate: null,
      agreementDocument: file.filename, // ✅ USE file.filename (the one multer created)
      notes: `Original: ${file.originalname}`, // Store original name in notes
    }));

    const documents = documentsFiles.map((file, index) => ({
      documentTypeId: req.body.documentTypeId || 1,
      documentNumber: req.body.documentNumber || `AUTO${index + 1}`,
      uploadDate: new Date().toISOString().split("T")[0],
      filename: file.filename, // ✅ USE file.filename
      filetype: file.mimetype,
      filesize: file.size,
    }));

    // Construct JSON payload
    const jsonData = {
      ...req.body,
      ...(agreements.length > 0 && { agreements }), // ✅ Only add if exists
      ...(documents.length > 0 && { documents }),
    };


    const result = await pool.query("CALL users_create($1)", [
      JSON.stringify(jsonData),
    ]);

    const { out_status, out_message, out_result } = result.rows[0] || {};

    res.status(out_status ? 200 : 400).json({
      status: out_status,
      message: out_message,
      userId: out_result,
      agreementsUploaded: agreements.length,
      documentsUploaded: documents.length,
    });
  } catch (error) {
    console.error("Error in createUsers:", error);
    next(error);
  }
};

const updateUsers = async (req, res, next) => {
  const pool = getPool();

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "User ID is required",
      });
    }

    const agreementsFiles = req.files?.agreement || [];
    const documentsFiles = req.files?.document || [];

    // If files are uploaded, treat them as NEW additions (not updates)
    const agreements = agreementsFiles.map((file, index) => ({
      // No agreementId means INSERT new agreement
      agreementDate: new Date().toISOString().split("T")[0],
      agreementSignDate: new Date().toISOString().split("T")[0],
      agreementStatusId: 1,
      approvalDate: null,
      expiryDate: null,
      agreementDocument: file.filename,
      notes: `Uploaded: ${file.originalname}`,
    }));

    const documents = documentsFiles.map((file, index) => ({
      // No documentId means INSERT new document
      documentTypeId: req.body.documentTypeId || 1,
      documentNumber: req.body.documentNumber || `DOC${index + 1}`,
      uploadDate: new Date().toISOString().split("T")[0],
      filename: file.filename,
      filetype: file.mimetype,
      filesize: file.size,
    }));

    // Construct JSON payload
    const jsonData = {
      userid: Number(id),
      ...req.body,
      ...(agreements.length > 0 && { agreements }),
      ...(documents.length > 0 && { documents }),
    };

    const result = await pool.query("CALL users_update($1)", [
      JSON.stringify(jsonData),
    ]);

    const { out_status, out_message, out_result } = result.rows[0] || {};

    res.status(out_status ? 200 : 400).json({
      status: out_status,
      message: out_message,
      userId: Number(id),
      agreementsAdded: agreements.length,
      documentsAdded: documents.length,
    });
  } catch (err) {
    console.error("Error in updateUsers:", err);
    res.status(500).json({
      status: false,
      message: err.message,
    });
  }
};

const getByIdUsers = async (req, res, next) => {
  const pool = getPool();
  try {
    let { id } = req.params;
    id = Number(id);
    if (isNaN(id) || !id) {
      return res
        .status(400)
        .json({ message: "Invalid or Suspicious input in Id" });
    }
    // Call Postgres function to get user by ID
    const result = await pool.query("SELECT * FROM users_get_by_id($1)", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User by id fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching user by ID =", error);
    next(error);
  }
};

const deleteUsers = async (req, res, next) => {
  const pool = getPool();
  try {
    let { id } = req.params;
    id = Number(id);
    if (isNaN(id) || !id) {
      return res
        .status(400)
        .json({ message: "Invalid or Suspicious input in Id" });
    }

    const result = await pool.query("Call users_delete($1)", [id]);

    const { out_message, out_status, out_result } = result.rows[0];

    if (out_status) {
      return res.status(200).json({
        status: out_status,
        message: out_message,
        result: out_result,
      });
    } else {
      return res.status(400).json({
        status: out_status,
        message: out_message,
        result: out_result,
      });
    }
  } catch (error) {
    console.log("error in deleting Users =", error);
    next(error);
  }
};

const updateUserProfile = async (req, res) => {
  const pool = getPool();

  try {
    const { id } = req.params;
    const {
      name,
      username,
      phone,
      email,
      image // frontend se aayega
    } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // 🔹 Base query (image ke bina)
    let query = `
      UPDATE users
      SET
        name = $1,
        username = $2,
        phone = $3,
        email = $4,
        updated_at = NOW()
      WHERE userid = $5
    `;

    let values = [name, username, phone, email, id];
   
    // 🔥 Agar image change hui hai tabhi update karo
    if (image && image.trim() !== "") {
      query = `
        UPDATE users
        SET
          name = $1,
          username = $2,
          phone = $3,
          email = $4,
          userimage = $5, -- ⚠️ base64 yahin store kar rahe ho
          updated_at = NOW()
        WHERE userid = $6
      `;
      values = [name, username, phone, email, image, id];
    }

    await pool.query(query, values);

    return res.json({
      status: true,
      message: "User profile updated successfully"
    });

  } catch (error) {
    console.error("Update user error =>", error);
    return res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
};

module.exports = {
  getUsers,
  createUsers,
  updateUsers,
  getByIdUsers,
  deleteUsers,
  updateUserProfile
};