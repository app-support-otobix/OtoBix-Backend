// Admin/admin_car_dropdowns_controller.js
const CarMakeModelVariantModel = require('../Models/carMakeModelVariantModel');

// Fetch all dropdowns with pagination and search
exports.getCarDropdownsList = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (page - 1) * limit;

        // Build search query
        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { make: { $regex: search, $options: 'i' } },
                    { model: { $regex: search, $options: 'i' } },
                    { variant: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Get dropdowns with pagination
        const dropdowns = await CarMakeModelVariantModel.find(searchQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count for pagination
        const total = await CarMakeModelVariantModel.countDocuments(searchQuery);

        res.status(200).json({
            success: true,
            data: dropdowns,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching dropdowns list:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dropdowns list',
            error: error.message,
        });
    }
};

// Add new dropdown
exports.addCarDropdown = async (req, res) => {
    try {
        const { make, model, variant } = req.body;

        // Validate required fields
        if (!make || !model || !variant) {
            return res.status(400).json({
                success: false,
                message: 'Make, model, and variant are required fields'
            });
        }

        // Create full name
        const fullName = `${make} ${model} ${variant}`;

        // Check if dropdown already exists
        const existingDropdown = await CarMakeModelVariantModel.findOne({
            make,
            model,
            variant
        });

        if (existingDropdown) {
            return res.status(400).json({
                success: false,
                message: 'This car dropdown already exists'
            });
        }

        // Create new dropdown
        const newDropdown = new CarMakeModelVariantModel({
            make,
            model,
            variant,
            fullName,
            isActive: true
        });

        await newDropdown.save();

        res.status(200).json({
            success: true,
            message: 'Car dropdown added successfully',
            data: newDropdown
        });
    } catch (error) {
        console.error('Error adding dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding dropdown',
            error: error.message,
        });
    }
};

// Edit dropdown
exports.editCarDropdown = async (req, res) => {
    try {
        const { dropdownId, make, model, variant, isActive } = req.body;

        // Validate required fields
        if (!make || !model || !variant) {
            return res.status(400).json({
                success: false,
                message: 'Make, model, and variant are required fields'
            });
        }

        // Create full name
        const fullName = `${make} ${model} ${variant}`;

        // Check if another dropdown already exists with same details
        const existingDropdown = await CarMakeModelVariantModel.findOne({
            make,
            model,
            variant,
            _id: { $ne: dropdownId }
        });

        if (existingDropdown) {
            return res.status(400).json({
                success: false,
                message: 'Another car dropdown with these details already exists'
            });
        }

        // Update dropdown
        const updatedDropdown = await CarMakeModelVariantModel.findByIdAndUpdate(
            dropdownId,
            {
                make,
                model,
                variant,
                fullName,
                isActive: isActive !== undefined ? isActive : true
            },
            { new: true, runValidators: true }
        );

        if (!updatedDropdown) {
            return res.status(404).json({
                success: false,
                message: 'Car dropdown not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Car dropdown updated successfully',
            data: updatedDropdown
        });
    } catch (error) {
        console.error('Error editing dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Error editing dropdown',
            error: error.message,
        });
    }
};

// Delete dropdown
exports.deleteCarDropdown = async (req, res) => {
    try {
        const { dropdownId } = req.body;

        const deletedDropdown = await CarMakeModelVariantModel.findByIdAndDelete(dropdownId);

        if (!deletedDropdown) {
            return res.status(404).json({
                success: false,
                message: 'Car dropdown not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Car dropdown deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting dropdown',
            error: error.message,
        });
    }
};

// Toggle dropdown status
exports.toggleCarDropdownStatus = async (req, res) => {
    try {
        const { dropdownId } = req.body;

        const dropdown = await CarMakeModelVariantModel.findById(dropdownId);

        if (!dropdown) {
            return res.status(404).json({
                success: false,
                message: 'Car dropdown not found'
            });
        }

        dropdown.isActive = !dropdown.isActive;
        await dropdown.save();

        res.status(200).json({
            success: true,
            message: `Car dropdown ${dropdown.isActive ? 'activated' : 'deactivated'} successfully`,
            data: dropdown
        });
    } catch (error) {
        console.error('Error toggling dropdown status:', error);
        res.status(500).json({
            success: false,
            message: 'Error toggling dropdown status',
            error: error.message,
        });
    }
};