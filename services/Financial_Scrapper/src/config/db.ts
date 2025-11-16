import { createPool, Pool } from "mysql2";
import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { MySql2PoolQueryRunner } from "ts-sql-query/queryRunners/MySql2PoolQueryRunner";

// --- Création d'un pool de connexions MySQL ---
// On centralise les paramètres de connexion via les variables d'environnement.
// connectionLimit définit le nombre max de connexions simultanées dans le pool.
const pool : Pool = createPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  connectionLimit: 10,
})

// --- Classe de connexion spécifique à notre projet ---
// DBConnection hérite de MySqlConnection fournie par ts-sql-query.
// On associe le pool au query runner MySql2 pour exécuter les requêtes.
export class DBConnection extends MySqlConnection<'DBConnection'> {
 constructor(){
  super(new MySql2PoolQueryRunner(pool))
 }
}

// --- Export brut du pool ---
// Utile si l'on a besoin d'accéder directement au driver mysql2 (ex: migrations, opérations brutes).
export const database = pool;