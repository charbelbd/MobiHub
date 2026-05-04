import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { money } from '../lib/utils';
import { finalPrice } from '../lib/pricing';
import { useToast } from '../components/ToastProvider';

export default function Stock({ refreshKey, refresh }) {
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [active, setActive] = useState('');
  const [modal, setModal] = useState(null);
  const [editProduct, setEditProduct] = useState(null);
  const [editCategory, setEditCategory] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deleteCategory, setDeleteCategory] = useState(null);
  const [categorySearch, setCategorySearch] = useState('');

  const load = () =>
    Promise.all([api.listCategories(), api.listProducts()]).then(([c, p]) => {
      setCategories(c);
      setProducts(p);
      setActive(a => a || c[0]?.id || '');
    });

  useEffect(() => {
    load();
  }, [refreshKey]);

  const saveCategory = async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);
    const row = {
      name: f.get('name'),
      description: f.get('description')
    };

    try {
      if (editCategory) {
        await api.updateCategory(editCategory.id, row);
        toast('Category updated successfully');
      } else {
        const created = await api.createCategory(row);
        setActive(created.id);
        toast('Category created successfully');
      }

      setEditCategory(null);
      setModal(null);
      await load();
      refresh();
    } catch (err) {
      toast(err.message || 'Category action failed', 'error');
    }
  };

  const saveProduct = async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);
    const row = {
      category_id: active,
      name: f.get('name'),
      description: f.get('description'),
      barcode: f.get('barcode'),
      price: Number(f.get('price')),
      profit_price: Number(f.get('profit_price') || 0),
      quantity: Number(f.get('quantity'))
    };

    try {
      if (editProduct) {
        await api.updateProduct(
          editProduct.id,
          Object.fromEntries(
            Object.entries(row).filter(([, v]) => v !== '' && !Number.isNaN(v))
          )
        );
        toast('Product updated successfully');
      } else {
        await api.createProduct(row);
        toast('Product added to stock');
      }

      setEditProduct(null);
      setModal(null);
      await load();
      refresh();
    } catch (err) {
      toast(err.message || 'Product action failed', 'error');
    }
  };

  const confirmDeleteProduct = async () => {
    try {
      await api.deleteProduct(deleteProduct.id);
      setDeleteProduct(null);
      await load();
      refresh();
      toast('Product deleted successfully');
    } catch (err) {
      toast(err.message || 'Could not delete product', 'error');
    }
  };

  const confirmDeleteCategory = async deleteProductsToo => {
    try {
      await api.deleteCategory(deleteCategory.id, deleteProductsToo);

      setDeleteCategory(null);
      setActive('');
      await load();
      refresh();
      toast('Category deleted successfully');
    } catch (err) {
      toast(err.message || 'Could not delete category', 'error');
    }
  };

  const filteredCategories = useMemo(
    () =>
      categories.filter(c =>
        `${c.name} ${c.description || ''}`
          .toLowerCase()
          .includes(categorySearch.toLowerCase())
      ),
    [categories, categorySearch]
  );

  const rows = products.filter(p => p.category_id === active);
  const activeCategory = categories.find(c => c.id === active);

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Stock Management</h1>
          <p>Create categories and manage product stock.</p>
        </div>

        <div>
          <button
            className="secondary"
            onClick={() => {
              setEditCategory(null);
              setModal('category');
            }}
          >
            Create Category
          </button>

          <button
            className="primary"
            disabled={!active}
            onClick={() => {
              setEditProduct(null);
              setModal('product');
            }}
          >
            Add Product
          </button>
        </div>
      </div>

      <div className="stockLayout">
        <aside className="categoryPanel">
          <div className="categoryPanelHeader">
            <h2>Product Types</h2>
            <span>{categories.length} categories</span>
          </div>

          <input
            className="categorySearch"
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
            placeholder="Search categories..."
          />

          <div className="categoryList">
            {filteredCategories.map(c => (
              <button
                className={active === c.id ? 'active' : ''}
                onClick={() => setActive(c.id)}
                key={c.id}
              >
                <b>{c.name}</b>
                <small>
                  {products.filter(p => p.category_id === c.id).length} products
                </small>
              </button>
            ))}
          </div>

          <select
            className="mobileCategorySelect"
            value={active}
            onChange={e => setActive(e.target.value)}
          >
            {filteredCategories.map(c => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </aside>

        <section className="stockProducts">
          <div className="tableTitle stockTitleActions">
            <div>
              <h2>{activeCategory?.name || 'Products'}</h2>
              <p>{activeCategory?.description || 'Selected category products'}</p>
            </div>

            {activeCategory && (
              <div className="actionGroup">
                <button
                  className="ghost"
                  onClick={() => {
                    setEditCategory(activeCategory);
                    setModal('category');
                  }}
                >
                  Edit Category
                </button>

                <button
                  className="ghost dangerText"
                  onClick={() => setDeleteCategory(activeCategory)}
                >
                  Delete Category
                </button>
              </div>
            )}
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Barcode</th>
                  <th>Base Price</th>
                  <th>Profit Price</th>
                  <th>Final Price</th>
                  <th>Quantity</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.description}</td>
                    <td>{p.barcode}</td>
                    <td>{money(p.price)}</td>
                    <td>{money(p.profit_price)}</td>
                    <td>{money(finalPrice(p))}</td>
                    <td>{p.quantity}</td>
                    <td>
                      <div className="tableActions">
                        <button
                          className="ghost"
                          onClick={() => {
                            setEditProduct(p);
                            setModal('product');
                          }}
                        >
                          Edit
                        </button>

                        <button
                          className="ghost dangerText"
                          onClick={() => setDeleteProduct(p)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan="8" className="emptyCell">
                      No products inside this category yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modal === 'category' && (
        <Modal
          title={editCategory ? 'Edit Category' : 'Create Category'}
          onClose={() => {
            setModal(null);
            setEditCategory(null);
          }}
        >
          <form onSubmit={saveCategory} className="form">
            <label>
              Name
              <input
                name="name"
                required
                defaultValue={editCategory?.name || ''}
                placeholder="Category name"
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                defaultValue={editCategory?.description || ''}
                placeholder="Category description"
              />
            </label>

            <button className="primary">
              {editCategory ? 'Save Changes' : 'Save Category'}
            </button>
          </form>
        </Modal>
      )}

      {modal === 'product' && (
        <Modal
          title={editProduct ? 'Edit Product' : 'Add Product'}
          onClose={() => {
            setModal(null);
            setEditProduct(null);
          }}
        >
          <form onSubmit={saveProduct} className="form">
            <label>
              Name
              <input
                name="name"
                defaultValue={editProduct?.name || ''}
                required={!editProduct}
                placeholder="Product name"
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                defaultValue={editProduct?.description || ''}
                placeholder="Product description"
              />
            </label>

            <label>
              Barcode
              <input
                name="barcode"
                autoFocus
                defaultValue={editProduct?.barcode || ''}
                placeholder="Scan or type barcode"
              />
            </label>

            <label>
              Price
              <input
                name="price"
                type="number"
                step="0.01"
                defaultValue={editProduct?.price ?? ''}
                required={!editProduct}
                placeholder="Base price / cost"
              />
            </label>

            <label>
              Profit Price
              <input
                name="profit_price"
                type="number"
                step="0.01"
                defaultValue={editProduct?.profit_price ?? ''}
                placeholder="Profit added to POS price"
              />
            </label>

            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                defaultValue={editProduct?.quantity ?? ''}
                required={!editProduct}
                placeholder="Quantity"
              />
            </label>

            <button className="primary">
              {editProduct ? 'Save Changes' : 'Save Product'}
            </button>
          </form>
        </Modal>
      )}

      {deleteProduct && (
        <Modal title="Delete Product" onClose={() => setDeleteProduct(null)}>
          <div className="confirmBox">
            <p>Are you sure you want to delete this product?</p>
            <strong>{deleteProduct.name}</strong>

            <div className="modalActions">
              <button className="ghost" onClick={() => setDeleteProduct(null)}>
                Keep Product
              </button>
              <button className="primary dangerButton" onClick={confirmDeleteProduct}>
                Delete Product
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteCategory && (
        <Modal title="Delete Category" onClose={() => setDeleteCategory(null)}>
          <div className="confirmBox">
            <p>
              Are you sure you want to delete this category?
            </p>

            <strong>{deleteCategory.name}</strong>

            {products.filter(p => p.category_id === deleteCategory.id).length > 0 && (
              <p className="warningText">
                This category contains products. You can cancel, or delete the
                category together with its products.
              </p>
            )}

            <div className="modalActions">
              <button className="ghost" onClick={() => setDeleteCategory(null)}>
                Cancel
              </button>

              {products.filter(p => p.category_id === deleteCategory.id).length === 0 ? (
                <button
                  className="primary dangerButton"
                  onClick={() => confirmDeleteCategory(false)}
                >
                  Delete Category
                </button>
              ) : (
                <button
                  className="primary dangerButton"
                  onClick={() => confirmDeleteCategory(true)}
                >
                  Delete Category & Products
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}