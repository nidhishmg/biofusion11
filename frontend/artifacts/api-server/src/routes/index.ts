import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import biosignalRouter from "./biosignal.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/biosignal", biosignalRouter);

export default router;
