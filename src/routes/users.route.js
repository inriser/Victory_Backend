const express = require("express");
const { getUsers, createUsers, updateUsers, getByIdUsers, deleteUsers, updateUserProfile } = require("../controllers/users.controller");
const router = express.Router();
const upload = require('../middleware/uploadFiles.middleware');

router.get('/', getUsers);

router.post(
  "/",
  upload.fields([
    { name: "agreement", maxCount: 1 },
    { name: "document", maxCount: 1 },
    { name: "grievanceAttachment", maxCount: 1 },
  ]),
  createUsers
);

router.put('/:id', upload.any(), updateUsers);

router.get('/:id', getByIdUsers);

router.delete('/:id', deleteUsers);

router.put("/users/:id", updateUserProfile);

module.exports = router;