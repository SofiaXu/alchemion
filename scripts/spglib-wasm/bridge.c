#include <spglib.h>

/* Copy numeric fields across a small ABI so JS need not know the C struct layout. */
SpglibDataset *modeling_find(const double *lattice, const double *positions,
                            const int *types, int count, int hall,
                            double distance, double angle) {
    return spgat_get_dataset_with_hall_number((const double (*)[3])lattice,
                                             (const double (*)[3])positions,
                                             types, count, hall, distance, angle);
}

void modeling_header(const SpglibDataset *data, double *out) {
    out[0] = data->spacegroup_number;
    out[1] = data->hall_number;
    out[2] = data->n_operations;
    out[3] = data->n_std_atoms;
    for (int row = 0; row < 3; row++) {
        out[13 + row] = data->origin_shift[row];
        for (int col = 0; col < 3; col++) {
            out[4 + 3 * row + col] = data->transformation_matrix[row][col];
            out[16 + 3 * row + col] = data->primitive_lattice[row][col];
        }
    }
}

void modeling_operation(const SpglibDataset *data, int index, double *out) {
    for (int row = 0; row < 3; row++) {
        out[9 + row] = data->translations[index][row];
        for (int col = 0; col < 3; col++)
            out[3 * row + col] = data->rotations[index][row][col];
    }
}

int modeling_orbit(const SpglibDataset *data, int index) {
    return data->equivalent_atoms[index];
}

int modeling_primitive_site(const SpglibDataset *data, int index) {
    return data->mapping_to_primitive[index];
}
