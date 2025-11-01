import { 
  addService, 
  readService, 
  updateService,
  deleteService, 
} from './adressController';
import { middleware } from "packages";
import express from "express";

let { LogRequest, controleOrigine } = middleware

const router = express.Router()
router.use(controleOrigine)
router.use(LogRequest)

router.route('/service')
.delete(deleteService)
.put(updateService)
.get(readService)
.post(addService)

export default router