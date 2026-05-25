// Lo que llega en el body al CREAR un producto
export interface CreateProductDto {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    category: string;
}

// Lo que llega en el body al ACTUALIZAR (todos opcionales)
export interface UpdateProductDto {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
  image?: File;
  removeImage?: boolean;   // ← esto falta
}

// Parámetros de query para listar productos
export interface ProductQuery {
    page?: string;
    limit?: string;
    search?: string;
    category?: string;
    isActive?: string;
}