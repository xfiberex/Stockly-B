// T5-05 — `leadTimeDays` sale de lo que cuenta cada nota. MegaSupply se queda **sin plazo** a
// propósito: es el caso en que la sugerencia de reposición usa el de Configuración y lo dice.
export const suppliersData = [
    {
        name:  "TechDistribuidor SA",
        email: "ventas@techdistribuidor.com",
        phone: "+52 55 1234 5678",
        notes: "Proveedor principal de electrónica, smartphones y laptops. Entrega en 2-3 días hábiles.",
        leadTimeDays: 3,
    },
    {
        name:  "Global Electronics",
        email: "contacto@globalelectronics.mx",
        phone: "+52 33 2345 6789",
        notes: "Importador especializado en periféricos y monitores. Despacha desde Guadalajara.",
        leadTimeDays: 10,
    },
    {
        name:  "MegaSupply Corp",
        email: "info@megasupply.com.mx",
        phone: "+52 81 3456 7890",
        notes: "Distribuidor de gaming y audio premium. Crédito a 30 días.",
        leadTimeDays: null,
    },
    {
        name:  "Importaciones del Norte",
        email: "pedidos@importnorte.mx",
        phone: "+52 614 456 7890",
        notes: "Especialista en almacenamiento y equipos de red. Mejor precio en pedidos de volumen.",
        leadTimeDays: 14,
    },
    {
        name:  "Tech Parts S.A. de C.V.",
        email: "ventas@techparts.mx",
        phone: "+52 55 5678 9012",
        notes: "Accesorios, cables y consumibles al mayoreo. Despacho mismo día.",
        leadTimeDays: 1,
    },
];
