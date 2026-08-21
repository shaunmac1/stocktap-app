import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stripeRouter from "./stripe";
import invoiceRouter from "./invoices";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stripeRouter);
router.use(invoiceRouter);

export default router;
