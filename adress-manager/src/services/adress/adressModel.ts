import { utils, params } from "packages";
import { Schema, model } from "mongoose";

let { isValidIP } = utils
let { serviceName } = params;

interface IService {
  _id: string;
  service: string;
  port: number,
  adressIP: string,
  status: number
}

const servicesSchema = new Schema<IService>({
  service: {
    type: String,
    required: [true, "Service required"],
    index : true,
    enum: {
      values: serviceName.array,
      message: '{VALUE} is not a supported service'
    }
  },
  port: {
    type: Number,
    required: [true, "Port required"],
  },
  adressIP: {
    type: String,
    required: [true, "IP required"],
    validate : {
      validator: (v) => isValidIP(v)
    }
  },
  status : {
    type: Number,
    required: [true, "Status required"],
    enum : [0, 1, 2],
    default : 1
  }
}, {
  collection : "services"
});

export default model<IService>("services", servicesSchema);
