import axios from "axios";

export let updateAfterControl = async ({adressIP, port, service, status} : {adressIP : string, port : number, service : string, status : number}, env : any) =>{
  await axios({
    url: '/service',
    method: 'put',
    baseURL: `http://127.0.0.1:${env.PORT_ADRESSMANAGER}`,
    data: {
      adressIP, 
      service,
      status,
      port
    }
  })
}

export let downAfterControle = async ({adressIP, service, port} : {adressIP : string, service : string, port : number}, env : any) => {
  await axios({
    url: '/service',
    method: 'delete',
    baseURL: `http://127.0.0.1:${env.PORT_ADRESSMANAGER}`,
    data: {
      adressIP, 
      service,
      port, 
    }
  })
}

export let ping = async (port :number) => {
  let res = await axios({
    url: '/ping',
    method: 'get',
    baseURL: `http://127.0.0.1:${port}`
  })

  return res
}